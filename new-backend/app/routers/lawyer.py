"""AI Lawyer router - legal consultations, document generation, calculators"""

from fastapi import APIRouter, Depends, HTTPException, status, UploadFile, File, Query, Form
from fastapi.responses import StreamingResponse
from typing import Annotated, List, Optional
import asyncpg
import logging
from datetime import datetime
from uuid import UUID
import io
import json

from ..schemas.lawyer import (
    LawyerChatRequest, LawyerChatResponse,
    SetLanguageRequest, LawyerLanguage,
    GenerateDocumentRequest, GenerateDocumentResponse, DocumentHistoryItem,
    UpdateDocumentRequest,
    AnalyzeContractResponse, ContractRisk, RiskLevel,
    CalculatePenaltyRequest, CalculatePenaltyResponse,
    CalculateTaxRequest, CalculateTaxResponse, TaxCalculationItem,
    CalculateFeeRequest, CalculateFeeResponse,
    ChatFeedbackRequest
)
from ..core.database import get_db_pool
from ..dependencies import get_current_user, require_feature
from ..services.ai_lawyer_service import get_ai_lawyer

router = APIRouter()
logger = logging.getLogger(__name__)


# ==================== LANGUAGE ====================

@router.post("/set-language", status_code=status.HTTP_200_OK)
async def set_language(
    request: SetLanguageRequest,
    current_user: Annotated[dict, require_feature("ai_lawyer")],
    pool: Annotated[asyncpg.Pool, Depends(get_db_pool)]
):
    """Set preferred language for AI Lawyer"""
    async with pool.acquire() as conn:
        await conn.execute(
            "UPDATE users SET lawyer_language = $1 WHERE id = $2",
            request.language.value, current_user['id']
        )
    
    return {"language": request.language.value, "message": "Language updated"}


@router.get("/language")
async def get_language(
    current_user: Annotated[dict, require_feature("ai_lawyer")],
    pool: Annotated[asyncpg.Pool, Depends(get_db_pool)]
):
    """Get current language preference"""
    async with pool.acquire() as conn:
        result = await conn.fetchval(
            "SELECT lawyer_language FROM users WHERE id = $1",
            current_user['id']
        )
    
    return {"language": result or "ru"}


# ==================== CHAT ====================

@router.post("/chat", response_model=LawyerChatResponse)
async def chat_with_lawyer(
    request: LawyerChatRequest,
    current_user: Annotated[dict, require_feature("ai_lawyer")],
    pool: Annotated[asyncpg.Pool, Depends(get_db_pool)]
):
    """
    Chat with AI Lawyer.
    
    Uses RAG to retrieve relevant legal articles from Kazakhstan law database.
    Supports Russian and Kazakh languages.
    """
    lawyer = get_ai_lawyer()
    
    try:
        # Get response from AI Lawyer (save messages AFTER to avoid duplicate in history)
        response_text, sources = await lawyer.chat(
            message=request.message,
            pool=pool,
            user_id=current_user['id'],
            language=request.language,
            include_history=request.include_history,
            use_rag=request.use_rag
        )

        # Save both user message and assistant response to history
        async with pool.acquire() as conn:
            await conn.execute("""
                INSERT INTO ai_chat_history (user_id, assistant_type, role, content)
                VALUES ($1, 'lawyer', 'user', $2)
            """, current_user['id'], request.message)
            await conn.execute("""
                INSERT INTO ai_chat_history (user_id, assistant_type, role, content)
                VALUES ($1, 'lawyer', 'assistant', $2)
            """, current_user['id'], response_text)
        
        return LawyerChatResponse(
            message=response_text,
            language=request.language,
            sources=sources,
            created_at=datetime.now()
        )
        
    except Exception as e:
        logger.error(f"Lawyer chat error: {e}", exc_info=True)
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="AI service temporarily unavailable"
        )


@router.get("/chat/history")
async def get_chat_history(
    current_user: Annotated[dict, require_feature("ai_lawyer")],
    pool: Annotated[asyncpg.Pool, Depends(get_db_pool)],
    limit: int = 50
):
    """Get chat history with AI Lawyer"""
    async with pool.acquire() as conn:
        messages = await conn.fetch("""
            SELECT id, role, content, created_at
            FROM ai_chat_history
            WHERE user_id = $1 AND assistant_type = 'lawyer'
            ORDER BY created_at DESC
            LIMIT $2
        """, current_user['id'], limit)
    
    return {
        "messages": [
            {
                "id": str(m['id']),
                "role": m['role'],
                "content": m['content'],
                "created_at": m['created_at'].isoformat()
            }
            for m in reversed(messages)
        ]
    }


@router.delete("/chat/history", status_code=status.HTTP_204_NO_CONTENT)
async def clear_chat_history(
    current_user: Annotated[dict, require_feature("ai_lawyer")],
    pool: Annotated[asyncpg.Pool, Depends(get_db_pool)]
):
    """Clear chat history with AI Lawyer"""
    async with pool.acquire() as conn:
        await conn.execute("""
            DELETE FROM ai_chat_history
            WHERE user_id = $1 AND assistant_type = 'lawyer'
        """, current_user['id'])


@router.post("/chat/feedback", status_code=status.HTTP_201_CREATED)
async def submit_feedback(
    request: ChatFeedbackRequest,
    current_user: Annotated[dict, require_feature("ai_lawyer")],
    pool: Annotated[asyncpg.Pool, Depends(get_db_pool)]
):
    """Submit feedback on AI Lawyer response"""
    try:
        message_id = UUID(request.message_id)
    except ValueError:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Invalid message_id format"
        )
    
    async with pool.acquire() as conn:
        # Verify message belongs to user
        message = await conn.fetchrow("""
            SELECT id FROM ai_chat_history
            WHERE id = $1 AND user_id = $2
        """, message_id, current_user['id'])
        
        if not message:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Message not found"
            )
        
        # Check for existing feedback and update/insert
        existing = await conn.fetchval(
            "SELECT id FROM lawyer_chat_feedback WHERE chat_message_id = $1",
            message_id
        )
        if existing:
            await conn.execute("""
                UPDATE lawyer_chat_feedback SET rating = $1, comment = $2
                WHERE chat_message_id = $3
            """, request.rating, request.comment, message_id)
        else:
            await conn.execute("""
                INSERT INTO lawyer_chat_feedback (user_id, chat_message_id, rating, comment)
                VALUES ($1, $2, $3, $4)
            """, current_user['id'], message_id, request.rating, request.comment)
    
    return {"message": "Feedback submitted"}


# ==================== DOCUMENT GENERATION ====================

@router.post("/generate-document", response_model=GenerateDocumentResponse)
async def generate_document(
    request: GenerateDocumentRequest,
    current_user: Annotated[dict, require_feature("ai_lawyer")],
    pool: Annotated[asyncpg.Pool, Depends(get_db_pool)]
):
    """
    Generate a legal document from template.
    
    Supported document types:
    - supply_contract: Договор поставки
    - sale_contract: Договор купли-продажи
    - service_contract: Договор оказания услуг
    - employment_contract: Трудовой договор
    - claim_to_supplier: Претензия поставщику
    - claim_to_buyer: Претензия покупателю
    - claim_to_marketplace: Претензия маркетплейсу
    """
    lawyer = get_ai_lawyer()
    
    try:
        title, content = lawyer.generate_document(
            document_type=request.document_type,
            data=request.data,
            language=request.language
        )
        
        # Save to database
        async with pool.acquire() as conn:
            doc_id = await conn.fetchval("""
                INSERT INTO lawyer_documents (user_id, document_type, title, language, input_data, content)
                VALUES ($1, $2, $3, $4, $5, $6)
                RETURNING id
            """, current_user['id'], request.document_type.value, title,
                request.language.value, json.dumps(request.data, ensure_ascii=False, default=str), content)
        
        return GenerateDocumentResponse(
            id=str(doc_id),
            document_type=request.document_type,
            title=title,
            content=content,
            pdf_url=None,  # TODO: Generate PDF
            docx_url=None,  # TODO: Generate DOCX
            created_at=datetime.now()
        )
        
    except ValueError as e:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=str(e)
        )


@router.get("/documents")
async def get_document_history(
    current_user: Annotated[dict, require_feature("ai_lawyer")],
    pool: Annotated[asyncpg.Pool, Depends(get_db_pool)],
    limit: int = 20
):
    """Get history of generated documents (with content for preview)"""
    async with pool.acquire() as conn:
        docs = await conn.fetch("""
            SELECT id, document_type, title, language, content, created_at
            FROM lawyer_documents
            WHERE user_id = $1
            ORDER BY created_at DESC
            LIMIT $2
        """, current_user['id'], limit)

    return [
        {
            "id": str(d['id']),
            "document_type": d['document_type'],
            "title": d['title'],
            "language": d['language'],
            "content": d['content'],
            "created_at": d['created_at'].isoformat(),
        }
        for d in docs
    ]


@router.get("/documents/{document_id}")
async def get_document(
    document_id: str,
    current_user: Annotated[dict, require_feature("ai_lawyer")],
    pool: Annotated[asyncpg.Pool, Depends(get_db_pool)]
):
    """Get a specific generated document"""
    try:
        doc_uuid = UUID(document_id)
    except ValueError:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Invalid document_id format"
        )
    
    async with pool.acquire() as conn:
        doc = await conn.fetchrow("""
            SELECT id, document_type, title, language, input_data, content, 
                   pdf_url, docx_url, created_at
            FROM lawyer_documents
            WHERE id = $1 AND user_id = $2
        """, doc_uuid, current_user['id'])
    
    if not doc:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Document not found"
        )
    
    return {
        "id": str(doc['id']),
        "document_type": doc['document_type'],
        "title": doc['title'],
        "language": doc['language'],
        "input_data": doc['input_data'],
        "content": doc['content'],
        "pdf_url": doc['pdf_url'],
        "docx_url": doc['docx_url'],
        "created_at": doc['created_at'].isoformat()
    }


@router.get("/documents/{document_id}/pdf")
async def download_document_pdf(
    document_id: str,
    current_user: Annotated[dict, require_feature("ai_lawyer")],
    pool: Annotated[asyncpg.Pool, Depends(get_db_pool)]
):
    """Download document as PDF (generated on-the-fly, not stored)"""
    try:
        doc_uuid = UUID(document_id)
    except ValueError:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Invalid document_id format"
        )

    async with pool.acquire() as conn:
        doc = await conn.fetchrow("""
            SELECT title, content FROM lawyer_documents
            WHERE id = $1 AND user_id = $2
        """, doc_uuid, current_user['id'])

    if not doc:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Document not found"
        )

    lawyer = get_ai_lawyer()
    try:
        pdf_bytes = lawyer.generate_pdf(content=doc['content'], title=doc['title'])
    except Exception as e:
        logger.error(f"PDF generation error: {e}", exc_info=True)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to generate PDF"
        )

    from urllib.parse import quote
    safe_title = doc['title'].replace('"', '').replace("'", "")
    encoded_title = quote(safe_title, safe='')
    return StreamingResponse(
        io.BytesIO(pdf_bytes),
        media_type="application/pdf",
        headers={
            "Content-Disposition": f"attachment; filename=\"document.pdf\"; filename*=UTF-8''{encoded_title}.pdf"
        }
    )


@router.patch("/documents/{document_id}")
async def update_document(
    document_id: str,
    request: UpdateDocumentRequest,
    current_user: Annotated[dict, require_feature("ai_lawyer")],
    pool: Annotated[asyncpg.Pool, Depends(get_db_pool)]
):
    """Update document content (for editing in UI)"""
    try:
        doc_uuid = UUID(document_id)
    except ValueError:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Invalid document_id format"
        )

    async with pool.acquire() as conn:
        result = await conn.execute("""
            UPDATE lawyer_documents SET content = $1
            WHERE id = $2 AND user_id = $3
        """, request.content, doc_uuid, current_user['id'])

    if result == "UPDATE 0":
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Document not found"
        )

    return {"message": "Document updated", "id": document_id}


# ==================== CONTRACT ANALYSIS ====================

def _extract_text_from_file(content: bytes, filename: str) -> str:
    """Extract text from uploaded file (PDF, DOCX, TXT)."""
    filename = filename.lower()

    if filename.endswith('.pdf'):
        try:
            from pypdf import PdfReader
            reader = PdfReader(io.BytesIO(content))
            pages = [page.extract_text() or '' for page in reader.pages]
            return '\n'.join(pages)
        except Exception as e:
            logger.error(f"PDF extraction error: {e}")
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Failed to extract text from PDF"
            )
    elif filename.endswith('.docx'):
        try:
            from docx import Document
            doc = Document(io.BytesIO(content))
            paragraphs = [p.text for p in doc.paragraphs if p.text.strip()]
            return '\n'.join(paragraphs)
        except Exception as e:
            logger.error(f"DOCX extraction error: {e}")
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Failed to extract text from DOCX"
            )
    else:
        return content.decode('utf-8', errors='ignore')


async def _run_contract_analysis(contract_text: str, language: LawyerLanguage) -> AnalyzeContractResponse:
    """Common logic for contract analysis (used by both file and text endpoints)."""
    if len(contract_text.strip()) < 100:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Text is too short for analysis (minimum 100 characters)"
        )

    lawyer = get_ai_lawyer()

    try:
        analysis = await lawyer.analyze_contract(contract_text, language)

        return AnalyzeContractResponse(
            summary=analysis.get('summary', ''),
            key_conditions=analysis.get('key_conditions', []),
            risks=[
                ContractRisk(
                    level=RiskLevel(r.get('level', 'medium')),
                    title=r.get('title', ''),
                    description=r.get('description', ''),
                    clause=r.get('clause'),
                    recommendation=r.get('recommendation', '')
                )
                for r in analysis.get('risks', [])
            ],
            recommendations=analysis.get('recommendations', []),
            overall_risk_level=RiskLevel(analysis.get('overall_risk_level', 'medium')),
            language=language
        )
    except Exception as e:
        logger.error(f"Contract analysis error: {e}", exc_info=True)
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Contract analysis service temporarily unavailable"
        )


@router.post("/analyze-contract", response_model=AnalyzeContractResponse)
async def analyze_contract(
    current_user: Annotated[dict, require_feature("ai_lawyer")],
    pool: Annotated[asyncpg.Pool, Depends(get_db_pool)],
    file: UploadFile = File(...),
    language: LawyerLanguage = LawyerLanguage.RUSSIAN
):
    """Analyze a contract file for risks and key conditions. Supports PDF, DOCX, TXT up to 10MB."""
    MAX_SIZE = 10 * 1024 * 1024
    content = await file.read()
    if len(content) > MAX_SIZE:
        raise HTTPException(
            status_code=status.HTTP_413_REQUEST_ENTITY_TOO_LARGE,
            detail="File too large. Maximum size is 10MB."
        )

    filename = file.filename or "unknown.txt"
    contract_text = _extract_text_from_file(content, filename)

    return await _run_contract_analysis(contract_text, language)


@router.post("/analyze-contract-text", response_model=AnalyzeContractResponse)
async def analyze_contract_text(
    current_user: Annotated[dict, require_feature("ai_lawyer")],
    pool: Annotated[asyncpg.Pool, Depends(get_db_pool)],
    text: str = Form(...),
    language: LawyerLanguage = LawyerLanguage.RUSSIAN
):
    """Analyze contract text directly (pasted by user)."""
    return await _run_contract_analysis(text, language)


# ==================== CALCULATORS ====================

@router.post("/calculate-penalty", response_model=CalculatePenaltyResponse)
async def calculate_penalty(
    request: CalculatePenaltyRequest,
    current_user: Annotated[dict, require_feature("ai_lawyer")]
):
    """
    Calculate penalty/interest amount.
    
    Uses NBK refinancing rate (15.75%) by default.
    Formula: Penalty = Principal × Days × (Rate / 365)
    """
    lawyer = get_ai_lawyer()
    
    try:
        result = lawyer.calculate_penalty(
            principal_amount=request.principal_amount,
            start_date=request.start_date,
            end_date=request.end_date,
            rate_type=request.rate_type,
            custom_rate=request.custom_rate
        )
        
        return CalculatePenaltyResponse(**result)
        
    except ValueError as e:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=str(e)
        )


@router.post("/calculate-tax", response_model=CalculateTaxResponse)
async def calculate_tax(
    request: CalculateTaxRequest,
    current_user: Annotated[dict, require_feature("ai_lawyer")]
):
    """
    Calculate taxes for Kazakhstan.
    
    Supported tax types:
    - simplified_ip: ИП на упрощённой декларации (3% ИПН + соц. платежи)
    - standard_ip: ИП на общеустановленном режиме (10% ИПН)
    - too_kpn: ТОО - корпоративный подоходный налог (20%)
    - vat: НДС (12%)
    """
    lawyer = get_ai_lawyer()
    
    result = lawyer.calculate_tax(
        tax_type=request.tax_type,
        revenue=request.revenue,
        expenses=request.expenses,
        period=request.period,
        employee_salary=request.employee_salary
    )
    
    return CalculateTaxResponse(
        tax_type=request.tax_type,
        period=result['period'],
        revenue=result['revenue'],
        expenses=result['expenses'],
        taxable_income=result['taxable_income'],
        taxes=[TaxCalculationItem(**t) for t in result['taxes']],
        total_tax=result['total_tax'],
        net_income=result['net_income']
    )


@router.post("/calculate-fee", response_model=CalculateFeeResponse)
async def calculate_fee(
    request: CalculateFeeRequest,
    current_user: Annotated[dict, require_feature("ai_lawyer")]
):
    """
    Calculate state fees.
    
    Supported fee types:
    - ip_registration: ИП регистрация (бесплатно через eGov)
    - too_registration: ТОО регистрация (1 МРП)
    - court_fee_property: Госпошлина по имущественному иску (1%)
    - court_fee_non_property: Госпошлина по неимущественному иску (0.5 МРП)
    - license_fee: Лицензионный сбор (зависит от вида)
    """
    lawyer = get_ai_lawyer()
    
    result = lawyer.calculate_fee(
        fee_type=request.fee_type,
        claim_amount=request.claim_amount
    )
    
    return CalculateFeeResponse(**result)


# ==================== FREQUENT QUESTIONS ====================

@router.get("/faq")
async def get_faq(
    language: LawyerLanguage = LawyerLanguage.RUSSIAN
):
    """Get frequently asked questions"""
    
    faq_ru = [
        {
            "question": "Какие налоги платит ИП на упрощёнке?",
            "category": "taxes"
        },
        {
            "question": "Как оформить возврат товара покупателю?",
            "category": "consumer"
        },
        {
            "question": "Какие документы нужны для регистрации ТОО?",
            "category": "business"
        },
        {
            "question": "Как правильно уволить сотрудника?",
            "category": "labor"
        },
        {
            "question": "Что делать если поставщик не выполнил договор?",
            "category": "contracts"
        },
        {
            "question": "Какие права имеет покупатель по гарантии?",
            "category": "consumer"
        },
        {
            "question": "Как составить претензию поставщику?",
            "category": "contracts"
        },
        {
            "question": "Нужна ли касса для ИП?",
            "category": "business"
        }
    ]
    
    faq_kk = [
        {
            "question": "Жеңілдетілген жүйедегі ЖК қандай салықтар төлейді?",
            "category": "taxes"
        },
        {
            "question": "Тауарды қайтаруды қалай рәсімдеуге болады?",
            "category": "consumer"
        },
        {
            "question": "ЖШС тіркеу үшін қандай құжаттар қажет?",
            "category": "business"
        }
    ]
    
    return {
        "questions": faq_ru if language == LawyerLanguage.RUSSIAN else faq_kk,
        "language": language.value
    }
