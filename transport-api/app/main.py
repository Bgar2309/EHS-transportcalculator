from fastapi import FastAPI, HTTPException, Depends
from fastapi.middleware.cors import CORSMiddleware
from typing import Optional
import os

from .auth import verify_api_key
from .schemas import CalculRequest, CalculResponse
from .database import get_db_data
from .calculator import calculer_transport

app = FastAPI(
    title="Transport API EHS",
    description="API de calcul des frais de transport EHS 2026",
    version="1.0.0",
    docs_url="/docs" if os.getenv("ENV", "production") != "production" else None,
    redoc_url=None,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=os.getenv("ALLOWED_ORIGINS", "*").split(","),
    allow_credentials=True,
    allow_methods=["GET", "POST"],
    allow_headers=["*"],
)

# Chargement des données au démarrage
@app.on_event("startup")
async def startup_event():
    get_db_data()  # initialise et charge en mémoire


@app.get("/health")
def health():
    return {"status": "ok"}


@app.get("/api/produits", dependencies=[Depends(verify_api_key)])
def liste_produits():
    """Retourne la liste des références produits disponibles."""
    data = get_db_data()
    refs = sorted(data["produits"].keys())
    return {"produits": refs}


@app.post("/api/calcul", response_model=CalculResponse, dependencies=[Depends(verify_api_key)])
def calcul_transport(payload: CalculRequest):
    """
    Calcule les options de transport pour une liste de produits
    et un département de destination.
    """
    dept = payload.departement
    if dept < 1 or dept > 95:
        raise HTTPException(status_code=422, detail="Département invalide (1-95 uniquement)")

    lignes = [(p.ref, p.quantite) for p in payload.produits if p.quantite > 0]
    if not lignes:
        raise HTTPException(status_code=422, detail="Aucun produit valide fourni")

    data = get_db_data()
    result = calculer_transport(lignes, dept, data)

    if result is None:
        raise HTTPException(status_code=404, detail="Produit(s) introuvable(s) dans le catalogue")

    return result


@app.get("/api/tarifs", dependencies=[Depends(verify_api_key)])
def info_tarifs():
    """
    Retourne des informations générales sur les grilles tarifaires
    (zones couvertes, types de transport) — sans exposer les prix.
    """
    data = get_db_data()
    return {
        "annee": 2026,
        "transporteurs": ["DPD", "Messagerie Kuehne", "Affrètement"],
        "departements_couverts": {
            "messagerie": len(data["messagerie"]),
            "affretement": len(data["affretement"]),
            "dpd": "France métropolitaine (1-30 kg)",
        },
        "produits_catalogue": len(data["produits"]),
    }
