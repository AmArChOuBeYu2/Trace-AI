from backend.app.database import db_manager
from datetime import datetime, timedelta

class PropagationService:
    @staticmethod
    def generate_propagation_graph(investigation_id: str) -> dict:
        """
        Creates or returns the nodes and edges representing the media propagation path.
        If no nodes exist in DB, auto-generates them from source candidates to populate the graph.
        """
        nodes = db_manager.get_propagation_nodes(investigation_id)
        edges = db_manager.get_propagation_edges(investigation_id)
        
        # If empty, let's auto-generate a tree from the source candidates
        if not nodes:
            candidates = db_manager.get_source_candidates(investigation_id)
            if candidates:
                # 1. Create a root source node
                root_label = "Earliest Discovered Public Instance"
                root_pub = candidates[0].get("publication_time") or (datetime.utcnow() - timedelta(hours=72)).isoformat()
                
                root_node = db_manager.create_propagation_node(
                    investigation_id=investigation_id,
                    node_type="source",
                    label=f"Source Candidate ({candidates[-1].get('platform', 'Web')})",
                    url=candidates[-1].get("url"), # usually oldest
                    platform=candidates[-1].get("platform", "Facebook"),
                    timestamp=root_pub,
                    confidence="high"
                )
                
                # 2. Add intermediate nodes and connections
                for idx, cand in enumerate(candidates):
                    # Skip root node
                    if cand.get("url") == root_node.get("url"):
                        continue
                        
                    node_type = "repost" if idx != 1 else "modification"
                    label = f"Repost ({cand.get('platform')})" if node_type == "repost" else f"Altered version ({cand.get('platform')})"
                    
                    child_node = db_manager.create_propagation_node(
                        investigation_id=investigation_id,
                        node_type=node_type,
                        label=label,
                        url=cand.get("url"),
                        platform=cand.get("platform"),
                        timestamp=cand.get("publication_time"),
                        confidence=cand.get("confidence")
                    )
                    
                    # Create edge from root to this node
                    relationship = "reposted" if node_type == "repost" else "modified"
                    db_manager.create_propagation_edge(
                        investigation_id=investigation_id,
                        source_node_id=root_node.get("id"),
                        target_node_id=child_node.get("id"),
                        relationship=relationship,
                        confidence=cand.get("confidence"),
                        evidence=cand.get("evidence")
                    )
                    
                # Reload nodes and edges
                nodes = db_manager.get_propagation_nodes(investigation_id)
                edges = db_manager.get_propagation_edges(investigation_id)
                
        # Format for React Flow: x/y coordinates for rendering layout
        formatted_nodes = []
        for idx, node in enumerate(nodes):
            # Position layout (simple horizontal/vertical hierarchy)
            x = 250
            y = 50 + (idx * 150)
            if idx > 0:
                x = 100 if idx % 2 == 1 else 400
                
            formatted_nodes.append({
                "id": node.get("id"),
                "type": "customNode" if node.get("node_type") == "source" else "default",
                "data": {
                    "label": node.get("label"),
                    "platform": node.get("platform"),
                    "url": node.get("url"),
                    "timestamp": node.get("timestamp"),
                    "node_type": node.get("node_type"),
                    "confidence": node.get("confidence")
                },
                "position": {"x": x, "y": y}
            })
            
        formatted_edges = []
        for edge in edges:
            formatted_edges.append({
                "id": edge.get("id"),
                "source": edge.get("source_node_id"),
                "target": edge.get("target_node_id"),
                "label": edge.get("relationship"),
                "animated": True if edge.get("relationship") == "modified" else False,
                "data": {
                    "relationship": edge.get("relationship"),
                    "confidence": edge.get("confidence")
                }
            })
            
        return {
            "nodes": formatted_nodes,
            "edges": formatted_edges
        }
