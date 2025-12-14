"""
DANAYA Hospital Registry Service

Manages hospital information for all healthcare facilities in Burkina Faso.

Copyright (c) 2025 Kader BONZI
Licensed under the Apache License, Version 2.0
"""

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from typing import Optional, List, Dict, Any
import json
import logging

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

app = FastAPI(
    title="DANAYA Hospital Registry",
    description="Central registry of healthcare facilities in Burkina Faso",
    version="1.0.0",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Load registry
with open("hospitals_bf.json", "r", encoding="utf-8") as f:
    registry_data = json.load(f)

# Create facility lookup
facilities_db = {}
for region in registry_data.get("regions", []):
    for facility in region.get("facilities", []):
        facilities_db[facility["id"]] = {
            **facility,
            "region_id": region["region_id"],
            "region_name": region["name"]
        }
        # Also index by short_code for easier lookup
        if "short_code" in facility:
            facilities_db[facility["short_code"]] = facilities_db[facility["id"]]

class Facility(BaseModel):
    id: str
    short_code: str
    name: str
    type: str
    level: str
    ownership: str
    district: str
    city: str
    address: Optional[str] = None
    logo_url: str
    region_id: str
    region_name: str
    capabilities: Dict[str, Any]
    status: str

@app.get("/")
async def root():
    return {
        "service": "DANAYA Hospital Registry",
        "version": "1.0.0",
        "country": registry_data.get("country"),
        "total_regions": len(registry_data.get("regions", [])),
        "total_facilities": len(facilities_db) // 2,  # Divided by 2 because we index by both id and short_code
        "docs": "/docs"
    }

@app.get("/health")
async def health_check():
    return {
        "status": "healthy",
        "service": "danaya-registry",
        "facilities": len(facilities_db) // 2
    }

@app.get("/facilities", response_model=List[Facility])
async def list_facilities(
    region: Optional[str] = None,
    type: Optional[str] = None,
    level: Optional[str] = None
):
    """List all facilities with optional filters"""
    # Get unique facilities (remove duplicates from short_code indexing)
    seen_ids = set()
    facilities = []
    
    for facility in facilities_db.values():
        if facility["id"] in seen_ids:
            continue
        seen_ids.add(facility["id"])
        
        # Apply filters
        if region and facility.get("region_name", "").lower() != region.lower():
            continue
        if type and facility.get("type", "").upper() != type.upper():
            continue
        if level and facility.get("level", "").lower() != level.lower():
            continue
        
        facilities.append(facility)
    
    return facilities

@app.get("/facilities/{facility_id}", response_model=Facility)
async def get_facility(facility_id: str):
    """Get facility by ID or short_code"""
    facility = facilities_db.get(facility_id)
    if not facility:
        raise HTTPException(
            status_code=404,
            detail=f"Facility '{facility_id}' not found"
        )
    return facility

@app.get("/regions")
async def list_regions():
    """Get all regions"""
    regions = [
        {
            "region_id": r["region_id"],
            "name": r["name"],
            "facility_count": len(r.get("facilities", []))
        }
        for r in registry_data.get("regions", [])
    ]
    return {"regions": regions, "total": len(regions)}

@app.get("/types")
async def list_types():
    """Get all facility types"""
    types = {}
    for facility in facilities_db.values():
        ftype = facility.get("type")
        if ftype and ftype not in types:
            types[ftype] = {
                "name": ftype,
                "level": facility.get("level"),
                "description": {
                    "CHU": "Centre Hospitalier Universitaire (University Hospital)",
                    "CHR": "Centre Hospitalier Régional (Regional Hospital)",
                    "CMA": "Centre Médical avec Antenne chirurgicale (Medical Center with Surgery)",
                    "CSPS": "Centre de Santé et de Promotion Sociale (Health Center)"
                }.get(ftype, ftype)
            }
    return types

@app.get("/search")
async def search_facilities(q: str):
    """Search facilities by name, city, or district"""
    query_lower = q.lower()
    seen_ids = set()
    results = []
    
    for facility in facilities_db.values():
        if facility["id"] in seen_ids:
            continue
        
        if (query_lower in facility.get("name", "").lower() or
            query_lower in facility.get("city", "").lower() or
            query_lower in facility.get("district", "").lower()):
            seen_ids.add(facility["id"])
            results.append(facility)
    
    return {"results": results, "count": len(results)}

if __name__ == "__main__":
    import uvicorn
    logger.info("=" * 70)
    logger.info("🏥 DANAYA Hospital Registry Starting")
    logger.info(f"📊 Regions loaded: {len(registry_data.get('regions', []))}")
    logger.info(f"🏥 Facilities loaded: {len(facilities_db) // 2}")
    logger.info("📡 Running on http://localhost:8003")
    logger.info("=" * 70)
    uvicorn.run(app, host="0.0.0.0", port=8003, log_level="info")
