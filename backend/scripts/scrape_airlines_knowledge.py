import os
import json
import time
import requests
from pathlib import Path
from bs4 import BeautifulSoup
from duckduckgo_search import DDGS

KNOWLEDGE_ROOT = Path(__file__).resolve().parents[2] / "knowledge" / "airlines"

FOLDERS = [
    "regulations", "dgca", "passenger_charter", "iata",
    "airlines/air_india", "airlines/indigo", "airlines/spicejet", 
    "airlines/akasa", "airlines/air_india_express", "airlines/alliance_air",
    "baggage", "refunds", "compensation", "complaints", "airports",
    "insurance", "faqs", "templates", "synthetic_cases"
]

# Map of queries to folder paths
QUERIES = [
    # DGCA & Regulations
    {"query": "DGCA Civil Aviation Requirements Section 3 Series M Part IV facilities to be provided to passengers", "folder": "dgca", "name": "car_section_3_m_iv"},
    {"query": "DGCA Passenger Charter rights of passengers", "folder": "passenger_charter", "name": "dgca_passenger_charter"},
    {"query": "DGCA domestic passenger rights refund compensation delay", "folder": "regulations", "name": "passenger_rights"},
    
    # International Rules
    {"query": "Montreal Convention 1999 liability rules IATA", "folder": "iata", "name": "montreal_convention"},
    {"query": "ICAO passenger rights guidelines", "folder": "iata", "name": "icao_guidelines"},
    
    # Airlines
    {"query": "IndiGo Conditions of Carriage baggage refund", "folder": "airlines/indigo", "name": "conditions_of_carriage"},
    {"query": "IndiGo Customer Charter", "folder": "airlines/indigo", "name": "customer_charter"},
    {"query": "Air India Baggage Policy", "folder": "airlines/air_india", "name": "baggage_policy"},
    {"query": "Air India Conditions of Carriage", "folder": "airlines/air_india", "name": "conditions_of_carriage"},
    {"query": "SpiceJet Conditions of Carriage", "folder": "airlines/spicejet", "name": "conditions_of_carriage"},
    {"query": "Akasa Air Terms and Conditions", "folder": "airlines/akasa", "name": "terms_and_conditions"},
    {"query": "Air India Express Baggage rules", "folder": "airlines/air_india_express", "name": "baggage_rules"},
    
    # Categories
    {"query": "airport policies lost baggage process India", "folder": "airports", "name": "lost_baggage_process"},
    {"query": "Delhi airport passenger assistance", "folder": "airports", "name": "delhi_airport_assistance"},
    {"query": "cabin baggage checked baggage limits guidelines India", "folder": "baggage", "name": "baggage_limits"},
    {"query": "flight refund timelines cancellation charges DGCA", "folder": "refunds", "name": "refund_timelines"},
    {"query": "flight delay cancellation overbooking compensation India", "folder": "compensation", "name": "compensation_rules"},
    {"query": "airline grievance process escalation nodal officer", "folder": "complaints", "name": "grievance_process"},
    {"query": "travel insurance claim rejected flight delay", "folder": "insurance", "name": "insurance_claims"},
    {"query": "flight delays refunds faqs", "folder": "faqs", "name": "flight_faqs"}
]

def ensure_folders():
    for folder in FOLDERS:
        (KNOWLEDGE_ROOT / folder).mkdir(parents=True, exist_ok=True)
    (KNOWLEDGE_ROOT / "metadata").mkdir(parents=True, exist_ok=True)

def scrape_text_from_url(url: str) -> str:
    try:
        headers = {'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'}
        response = requests.get(url, headers=headers, timeout=10)
        response.raise_for_status()
        
        # If it's a PDF, we can't easily parse it as text here, just download it
        if url.lower().endswith('.pdf') or b"%PDF" in response.content[:10]:
            return None # Indicate it's a PDF to the caller
            
        soup = BeautifulSoup(response.content, 'html.parser')
        
        # Strip script and style elements
        for script in soup(["script", "style", "nav", "footer", "header"]):
            script.extract()
            
        text = soup.get_text(separator='\n')
        # Clean up whitespace
        lines = (line.strip() for line in text.splitlines())
        chunks = (phrase.strip() for line in lines for phrase in line.split("  "))
        text = '\n'.join(chunk for chunk in chunks if chunk)
        
        # Return only if we got meaningful text (to avoid captcha pages)
        if len(text) > 500:
            return text
        return ""
    except Exception as e:
        print(f"Error fetching {url}: {e}")
        return ""

def main():
    print(f"Initializing Web Scraper to populate {KNOWLEDGE_ROOT} from real sources...")
    ensure_folders()
    
    with DDGS() as ddgs:
        for item in QUERIES:
            print(f"Searching web for real data: {item['query']}")
            try:
                results = list(ddgs.text(item["query"], max_results=3))
            except Exception as e:
                print(f"Search failed: {e}")
                continue
                
            success = False
            for res in results:
                url = res.get("href", "")
                title = res.get("title", item["name"])
                
                print(f"  Attempting to scrape: {url}")
                
                if url.lower().endswith(".pdf"):
                    # Download PDF directly
                    try:
                        headers = {'User-Agent': 'Mozilla/5.0'}
                        pdf_res = requests.get(url, headers=headers, timeout=15)
                        if b"%PDF" in pdf_res.content[:10]:
                            file_path = KNOWLEDGE_ROOT / item["folder"] / f"{item['name']}.pdf"
                            file_path.write_bytes(pdf_res.content)
                            print(f"  [SUCCESS] Downloaded PDF to {file_path}")
                            success = True
                    except Exception as e:
                        print(f"  PDF download failed: {e}")
                else:
                    # Scrape HTML text
                    text = scrape_text_from_url(url)
                    if text:
                        file_path = KNOWLEDGE_ROOT / item["folder"] / f"{item['name']}.txt"
                        
                        # Add a header to make it clear what this is
                        content = f"# {title}\nSource: {url}\n\n{text}"
                        file_path.write_text(content, encoding="utf-8")
                        print(f"  [SUCCESS] Scraped {len(text)} characters to {file_path}")
                        success = True
                
                if success:
                    # Write metadata
                    meta = {
                        "title": title,
                        "category": item["folder"],
                        "source_url": url,
                        "domain": "airlines",
                        "scraped_at": time.time()
                    }
                    meta_dir = KNOWLEDGE_ROOT / "metadata" / item["folder"]
                    meta_dir.mkdir(parents=True, exist_ok=True)
                    meta_path = meta_dir / f"{item['name']}.json"
                    meta_path.write_text(json.dumps(meta, indent=2), encoding="utf-8")
                    break # Stop after one successful fetch per query
                
                time.sleep(1) # Polite delay
                
            if not success:
                print(f"  [WARNING] Could not find or scrape data for {item['name']}")

if __name__ == "__main__":
    main()
