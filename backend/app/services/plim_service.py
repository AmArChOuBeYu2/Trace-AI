import json
from backend.app.database import db_manager

class PLIMService:
    @staticmethod
    def calculate_plim_analysis(investigation_id: str, weights: dict = None) -> dict:
        """
        Calculates the TRACE-PLIM risk scores and compiles evidence linking.
        Exposes explicit states for each component: NOT_ANALYZED, INSUFFICIENT_EVIDENCE, ANALYZED.
        """
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
        
        # Initialize default structured states
        sub_scores = {
            "manipulation": {
                "score": None,
                "evidence_available": False,
                "state": "NOT_ANALYZED",
                "confidence": "low",
                "supporting_findings": "Visual pipeline not executed yet."
            },
            "metadata": {
                "score": None,
                "evidence_available": False,
                "state": "NOT_ANALYZED",
                "confidence": "low",
                "supporting_findings": "EXIF/metadata parsing not executed yet."
            },
            "propagation": {
                "score": None,
                "evidence_available": False,
                "state": "NOT_ANALYZED",
                "confidence": "low",
                "supporting_findings": "Social media tracing not executed yet."
            },
            "narrative": {
                "score": None,
                "evidence_available": False,
                "state": "NOT_ANALYZED",
                "confidence": "low",
                "supporting_findings": "Narrative shift evaluation not executed yet."
            }
        }
        
        findings = []
        run = None
        
        if asset:
            run = db_manager.get_latest_analysis_run(asset.get("id"))
            if run:
                findings = db_manager.get_forensic_findings_by_run(run.get("id"))
                
        # 1. Evaluate Manipulation
        if run:
            if run.get("status") in ["running", "pending"]:
                sub_scores["manipulation"]["state"] = "NOT_ANALYZED"
            elif run.get("status") == "failed":
                sub_scores["manipulation"]["state"] = "INSUFFICIENT_EVIDENCE"
                sub_scores["manipulation"]["supporting_findings"] = "Visual analysis run failed."
            else:
                manip_score = 0.0
                manip_findings = [f for f in findings if f.get("category") in ["compression", "visual", "ai_analysis"]]
                
                if manip_findings:
                    for f in manip_findings:
                        category = f.get("category")
                        severity = f.get("severity", "info")
                        evidence_str = f.get("evidence")
                        
                        if category == "compression" and evidence_str:
                            try:
                                ev_dict = json.loads(evidence_str)
                                manip_score = max(manip_score, float(ev_dict.get("ela_anomaly_score", 0.0)))
                            except:
                                pass
                        elif category == "visual" and severity == "high":
                            manip_score = max(manip_score, 80.0)
                        elif category == "visual" and severity == "medium":
                            manip_score = max(manip_score, 50.0)
                        elif category == "ai_analysis" and evidence_str:
                            try:
                                ev_dict = json.loads(evidence_str)
                                ai_gen = float(ev_dict.get("ai_generation_likelihood", 0.0)) * 100.0
                                manip_lik = float(ev_dict.get("manipulation_likelihood", 0.0)) * 100.0
                                manip_score = max(manip_score, ai_gen, manip_lik)
                            except:
                                pass
                    
                    sub_scores["manipulation"]["score"] = round(manip_score, 2)
                    sub_scores["manipulation"]["evidence_available"] = True
                    sub_scores["manipulation"]["state"] = "ANALYZED"
                    sub_scores["manipulation"]["confidence"] = "high" if len(manip_findings) > 1 else "medium"
                    sub_scores["manipulation"]["supporting_findings"] = f"Visual anomaly check complete. Base score: {manip_score:.1f}%."
                else:
                    sub_scores["manipulation"]["state"] = "INSUFFICIENT_EVIDENCE"
                    sub_scores["manipulation"]["supporting_findings"] = "No visual indicators found in findings database."
                    
        # 2. Evaluate Metadata
        if run:
            if run.get("status") in ["running", "pending"]:
                sub_scores["metadata"]["state"] = "NOT_ANALYZED"
            elif run.get("status") == "failed":
                sub_scores["metadata"]["state"] = "INSUFFICIENT_EVIDENCE"
            else:
                meta_score = 0.0
                meta_findings = [f for f in findings if f.get("category") in ["metadata", "metadata_software"]]
                
                if meta_findings:
                    has_anomaly = False
                    for f in meta_findings:
                        category = f.get("category")
                        severity = f.get("severity", "info")
                        
                        if category == "metadata_software":
                            meta_score = max(meta_score, 80.0)
                            has_anomaly = True
                        elif category == "metadata" and severity in ["critical", "high"]:
                            meta_score = max(meta_score, 90.0)
                            has_anomaly = True
                        elif category == "metadata" and severity == "medium":
                            meta_score = max(meta_score, 55.0)
                            has_anomaly = True
                    
                    sub_scores["metadata"]["score"] = round(meta_score, 2)
                    sub_scores["metadata"]["evidence_available"] = True
                    sub_scores["metadata"]["state"] = "ANALYZED"
                    sub_scores["metadata"]["confidence"] = "high"
                    sub_scores["metadata"]["supporting_findings"] = "Stream parameters scanned." + (" Inconsistencies detected." if has_anomaly else " No inconsistencies identified.")
                else:
                    sub_scores["metadata"]["state"] = "INSUFFICIENT_EVIDENCE"
                    sub_scores["metadata"]["supporting_findings"] = "No technical stream metadata found."

        # 3. Evaluate Propagation Scope
        candidates = db_manager.get_source_candidates(investigation_id)
        nodes = db_manager.get_propagation_nodes(investigation_id)
        
        if not run or run.get("status") in ["running", "pending"]:
            sub_scores["propagation"]["state"] = "NOT_ANALYZED"
        elif not candidates:
            sub_scores["propagation"]["state"] = "INSUFFICIENT_EVIDENCE"
            sub_scores["propagation"]["supporting_findings"] = "No search candidates discovered."
        else:
            prop_score = 0.0
            if len(nodes) > 5:
                prop_score = 100.0
            elif len(nodes) > 3:
                prop_score = 75.0
            elif len(nodes) > 1:
                prop_score = 40.0
                
            sub_scores["propagation"]["score"] = round(prop_score, 2)
            sub_scores["propagation"]["evidence_available"] = True
            sub_scores["propagation"]["state"] = "ANALYZED"
            sub_scores["propagation"]["confidence"] = "medium"
            sub_scores["propagation"]["supporting_findings"] = f"Propagation network generated with {len(nodes)} observed nodes."

        # 4. Evaluate Narrative Evolution
        narratives = db_manager.get_narrative_versions(investigation_id)
        if not run or run.get("status") in ["running", "pending"]:
            sub_scores["narrative"]["state"] = "NOT_ANALYZED"
        elif not narratives:
            sub_scores["narrative"]["state"] = "INSUFFICIENT_EVIDENCE"
            sub_scores["narrative"]["supporting_findings"] = "No semantic variations observed."
        else:
            narrative_score = 0.0
            if len(narratives) > 3:
                narrative_score = 90.0
            elif len(narratives) > 1:
                narrative_score = 50.0
                
            sub_scores["narrative"]["score"] = round(narrative_score, 2)
            sub_scores["narrative"]["evidence_available"] = True
            sub_scores["narrative"]["state"] = "ANALYZED"
            sub_scores["narrative"]["confidence"] = "medium"
            sub_scores["narrative"]["supporting_findings"] = f"Narrative evolution tracked with {len(narratives)} claim versions."

        # Re-normalize weights across ANALYZED categories only
        analyzed_categories = [k for k, v in sub_scores.items() if v["state"] == "ANALYZED"]
        
        overall_score = None
        overall_state = "INSUFFICIENT_EVIDENCE"
        risk_level = "insufficient"
        
        if analyzed_categories:
            overall_state = "ANALYZED"
            weight_keys = {
                "manipulation": "w_manip",
                "metadata": "w_meta",
                "propagation": "w_prop",
                "narrative": "w_narr"
            }
            
            sum_active_weights = sum(weights.get(weight_keys[k], 0.0) for k in analyzed_categories)
            if sum_active_weights > 0:
                weighted_sum = sum(
                    sub_scores[k]["score"] * (weights.get(weight_keys[k], 0.0) / sum_active_weights)
                    for k in analyzed_categories
                )
                overall_score = min(max(weighted_sum, 0.0), 100.0)
                
                # Risk level mapping
                if overall_score > 75.0:
                    risk_level = "critical"
                elif overall_score > 55.0:
                    risk_level = "high"
                elif overall_score > 35.0:
                    risk_level = "medium"
                else:
                    risk_level = "low"
        else:
            # If still running, mark as NOT_ANALYZED
            if any(v["state"] == "NOT_ANALYZED" for v in sub_scores.values()):
                overall_state = "NOT_ANALYZED"
                risk_level = "pending"

        # C2PA state
        c2pa = db_manager.get_c2pa_record_by_media(asset.get("id")) if asset else None
        c2pa_status = c2pa.get("status") if c2pa else "NOT_PRESENT"
        
        plim_findings = {
            "origin": {
                "assessment": "No verified original metadata exists." if c2pa_status == "NOT_PRESENT" else f"C2PA status is {c2pa_status}.",
                "evidence": {
                    "earliest_timestamp": candidates[-1].get("publication_time") if candidates else None,
                    "earliest_url": candidates[-1].get("url") if candidates else None,
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
                    "overall_score": round(overall_score, 2) if overall_score is not None else None
                }
            }
        }
        
        return {
            "overall_score": round(overall_score, 2) if overall_score is not None else None,
            "overall_state": overall_state,
            "risk_level": risk_level,
            "weights": weights,
            "sub_scores": sub_scores,
            "plim_stages": plim_findings
        }

plim_service = PLIMService()
