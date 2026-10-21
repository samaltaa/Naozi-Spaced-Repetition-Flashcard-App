FROM python:3.12-slim

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PIP_NO_CACHE_DIR=1 \
    PIP_DISABLE_PIP_VERSION_CHECK=1 \
    PYTHONPATH=/app/src \
    HAZM_TAGGER_MODEL=/app/models/pos_tagger.model \
    PORT=7860

ARG SPACY_MODELS="es_core_news_md-3.8.0 en_core_web_md-3.8.0 ru_core_news_md-3.8.0 zh_core_web_md-3.8.0"

RUN useradd --create-home --uid 1000 user

WORKDIR /app

COPY requirements.txt .
RUN pip install -r requirements.txt \
    && for model in $SPACY_MODELS; do \
         pip install "https://github.com/explosion/spacy-models/releases/download/${model}/${model}-py3-none-any.whl"; \
       done \
    && python -c "from huggingface_hub import hf_hub_download; hf_hub_download('roshan-research/hazm-postagger', 'pos_tagger.model', local_dir='/app/models')"

COPY src ./src

USER user

EXPOSE 7860

CMD ["sh", "-c", "exec uvicorn curator.api:app --host 0.0.0.0 --port ${PORT}"]
