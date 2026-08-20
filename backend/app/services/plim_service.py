import json
from backend.app.database import db_manager

class PLIMService:
    @staticmethod
    def calculate_plim_analysis(investigation_id: str, weights: dict = None) -> dict:
        """
        Calculates the TRACE-PLIM risk scores and compiles evidence linking.
        Formula:
          Overall Risk = w_manip * S_manip + w_meta * S_meta + w_prop * S_prop + w_narr * S_narr
        """
        # Default hackathon weights
        if not weights:
            weights = {
                "w_manip": 0.35,
                "w_meta": 0.20,
                "w_prop": 0.20,
                "w_narr": 0.25
            }
            
        inv = db_manager.get_investigation(investigation_id)
        if not inv:
            return {"error": "Investigation not found"}
            
        assets = db_manager.get_media_assets_by_investigation(investigation_id)
        asset = assets[0] if assets else None
        
        # 1. Fetch P1/P2/P4 inputs
        manip_score = 0.0
        meta_score = 0.0
        prop_score = 0.0
        narrative_score = 0.0
        
        findings = []
        run = None
        
        if asset:
            run = db_manager.get_latest_analysis_run(asset.get("id"))
            if run:
                findings = db_manager.get_forensic_findings_by_run(run.get("id"))
                
        # Parse scores from findings
        for f in findings:
            category = f.get("category")
            severity = f.get("severity", "info")
            evidence_str = f.get("evidence")
            
            # Manipulation (ELA / AI score)
            if category == "compression" and evidence_str:
                try:
                    ev_dict = json.loads(evidence_str)
                    # Use the error level analysis score if available
                    manip_score = max(manip_score, float(ev_dict.get("ela_anomaly_score", 0.0)))
                except:
                    pass
            elif category == "visual" and severity == "high":
                manip_score = max(manip_score, 80.0)
            elif category == "visual" and severity == "medium":
                manip_score = max(manip_score, 50.0)
                
            # Metadata Consistency
            if category == "metadata":
                if severity == "critical" or severity == "high":
                    meta_score = max(meta_score, 90.0)
                elif severity == "medium":
                    meta_score = max(meta_score, 55.0)
                else:
                    meta_score = max(meta_score, 20.0)
                    
        # Propagation Score
        nodes = db_manager.get_propagation_nodes(investigation_id)
        if len(nodes) > 5:
            prop_score = 100.0
        elif len(nodes) > 3:
            prop_score = 75.0
        elif len(nodes) > 1:
            prop_score = 40.0
            
        # Narrative Shift Intensity
        narratives = db_manager.get_narrative_versions(investigation_id)
        if len(narratives) > 3:
            narrative_score = 90.0
        elif len(narratives) > 1:
            narrative_score = 50.0
            
        # Calculate dynamic weighted sum
        overall_risk = (
            (manip_score * weights.get("w_manip", 0.35)) +
            (meta_score * weights.get("w_meta", 0.20)) +
            (prop_score * weights.get("w_prop", 0.20)) +
            (narrative_score * weights.get("w_narr", 0.25))
        )
        overall_risk = min(max(overall_risk, 0.0), 100.0)
        
        # Risk thresholds mapping
        risk_level = "low"
        if overall_risk > 75.0:
            risk_level = "critical"
        elif overall_risk > 55.0:
            risk_level = "high"
        elif overall_risk > 35.0:
            risk_level = "medium"
            
        # Compile evidence structures linking stages
        c2pa = db_manager.get_c2pa_record_by_media(asset.get("id")) if asset else None
        c2pa_status = c2pa.get("status") if c2pa else "NOT_PRESENT"
        
        # Earliest discovered candidates
        candidates = db_manager.get_source_candidates(investigation_id)
        earliest_cand = candidates[-1] if candidates else None
        
        plim_findings = {
            "origin": {
                "assessment": "No verified original metadata exists." if c2pa_status == "NOT_PRESENT" else f"C2PA status is {c2pa_status}.",
                "evidence": {
                    "earliest_timestamp": earliest_cand.get("publication_time") if earliest_cand else None,
                    "earliest_url": earliest_cand.get("url") if earliest_cand else None,
                    "c2pa_present": c2pa_status != "NOT_PRESENT"
                }
            },
            "propagation": {
                "assessment": f"Media has propagated across {len(nodes)} distinct nodes/platforms.",
                "evidence": {
                    "platform_count": len(set(n.get("platform") for n in nodes)),
                    "node_count": len(nodes)
                }
            },
            "narrative_evolution": {
                "assessment": f"Identified {len(narratives)} contextual variants of claims.",
                "evidence": {
                    "variants": [n.get("text") for n in narratives]
                }
            },
            "amplification": {
                "assessment": "High speed reposts" if len(nodes) > 3 else "Slow diffusion propagation",
                "evidence": {
                    "active_edges": len(db_manager.get_propagation_edges(investigation_id))
                }
            },
            "potential_influence": {
                "assessment": f"Risk rating categorized as {risk_level.upper()}.",
                "evidence": {
                    "overall_score": round(overall_risk, 2)
                }
            }
        }
        
        return {
            "overall_score": round(overall_risk, 2),
            "risk_level": risk_level,
            "weights": weights,
            "sub_scores": {
                "manipulation": round(manip_score, 2),
                "metadata": round(meta_score, 2),
                "propagation": round(prop_score, 2),
                "narrative": round(narrative_score, 2)
            },
            "plim_stages": plim_findings
        }

plim_service = PLIMService()
