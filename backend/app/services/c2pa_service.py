import os

class C2PAService:
    @staticmethod
    def inspect_c2pa(filepath: str) -> dict:
        """
        Inspects media files for C2PA Content Credentials.
        Scans for JUMBF headers, manifest stores, and validation flags.
        """
        result = {
            "status": "NOT_PRESENT",
            "issuer": None,
            "claim": None,
            "verification_result": "No content credentials detected.",
            "raw_summary": {}
        }
        
        if not os.path.exists(filepath):
            result["status"] = "UNAVAILABLE"
            result["verification_result"] = "File is not accessible for scanning."
            return result
            
        try:
            # Read binary to detect C2PA / JUMBF structure signature
            # JUMBF boxes usually contain the type signature 'jumb' or 'c2pa'
            with open(filepath, "rb") as f:
                content = f.read(1024 * 1024) # Scan first 1MB for signature speed
                
            has_c2pa = b"c2pa" in content
            has_jumbf = b"jumb" in content or b"JUMBF" in content
            
            if has_c2pa or has_jumbf:
                # Content credentials are found!
                # Try to parse issuer name (e.g. Adobe, Truepic, etc. if written in certificate)
                issuer = "Unknown Issuer"
                if b"Adobe" in content:
                    issuer = "Adobe Content Credentials"
                elif b"Truepic" in content:
                    issuer = "Truepic Trust"
                elif b"Sony" in content:
                    issuer = "Sony Camera Sign"
                elif b"Leica" in content:
                    issuer = "Leica Content Credentials"
                    
                result["status"] = "CONTAINER_DETECTED"
                result["issuer"] = issuer
                result["claim"] = f"C2PA manifest found in container headers. Issuer: {issuer}."
                result["verification_result"] = f"C2PA container signature '{issuer}' detected via header parsing, but full cryptographic chain-of-trust validation is unavailable."
            else:
                result["status"] = "NOT_PRESENT"
                result["verification_result"] = "No C2PA/JUMBF signature detected in media headers."
                
        except Exception as e:
            print(f"[C2PA] Scanner error: {e}")
            result["status"] = "UNAVAILABLE"
            result["verification_result"] = f"Error scanning container signatures: {e}"
            
        return result

c2pa_service = C2PAService()
