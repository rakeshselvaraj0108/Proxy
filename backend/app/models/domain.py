from enum import Enum


class Domain(str, Enum):
    HEALTH_INSURANCE = "health_insurance"
    BANKING = "banking"
    TELECOM = "telecom"
    AIRLINES = "airlines"
    HEALTHCARE_PROVIDER = "healthcare_provider"
    HOUSING = "housing"
    ECOMMERCE = "ecommerce"
    GOVERNMENT = "government"


ACTIVE_DOMAINS = {Domain.HEALTH_INSURANCE}

DOMAIN_LABELS = {
    Domain.HEALTH_INSURANCE: "Health insurance claim denials and reimbursement disputes",
    Domain.BANKING: "Banking, credit card, chargeback, and unauthorized transaction disputes",
    Domain.TELECOM: "Telecom, broadband, billing, and contract disputes",
    Domain.AIRLINES: "Airline refunds, cancellation, delay, and baggage claims",
    Domain.HEALTHCARE_PROVIDER: "Hospital billing, medical records, and provider charge disputes",
    Domain.HOUSING: "Landlord, rental agreement, deposit, and maintenance disputes",
    Domain.ECOMMERCE: "Refund, warranty, defective product, and seller disputes",
    Domain.GOVERNMENT: "Public grievance, RTI, certificate, scheme, and administrative appeals",
}
