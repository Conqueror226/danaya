# CHR DORI - Special Note for Registry

When updating hospitals_bf.json, ensure CHR Dori entry includes:
```json
{
  "id": "BF-CHR-DOR",
  "name": "Centre Hospitalier Régional de Dori",
  "short_code": "CHR-DOR",
  "type": "CHR",
  "level": "secondary",
  "region_name": "Sahel",
  "city": "Dori",
  "district": "Dori",
  "established_year": 1925,
  "centenary_year": 2025,
  "special_features": [
    "Scanner (CT Scan) - Donated 2025",
    "Oxygen Generator - Donated 2025",
    "Telemedicine Hub for Sahel Region",
    "Quality Benchmark Hospital",
    "Biomedical Waste Management Model",
    "Training Center"
  ],
  "capabilities": [
    "emergency_services",
    "general_surgery",
    "obstetrics",
    "internal_medicine",
    "imaging_advanced",
    "laboratory",
    "telemedicine"
  ],
  "equipment": {
    "scanner": true,
    "oxygen_generator": true,
    "ultrasound": true,
    "xray": true,
    "modern_surgical": true
  },
  "catchment_area": "Entire Sahel Region",
  "serves_districts": 6,
  "coordinates_with_csps": 20,
  "strategic_importance": "Border location (Mali, Niger), Security-challenged region",
  "logo_url": "/logos/chr-dori.png",
  "logo_color": "#00A651",
  "contact": {
    "phone": "+226 XX XX XX XX",
    "email": "chr.dori@sante.gov.bf"
  },
  "notes": "Celebrated 100 years in 2025. Recently modernized with scanner and oxygen generator. Ideal pilot site for DANAYA due to modern equipment, strategic importance, and pioneering telemedicine experience."
}
```

This makes CHR Dori a highlighted facility in DANAYA system.
