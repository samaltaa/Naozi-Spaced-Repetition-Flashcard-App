from __future__ import annotations

import json
import sys
import uuid
from pathlib import Path

import typer
from rich.console import Console
from rich.table import Table

from curator.extract import ExtractionResult, extract_from_text
from curator.sources import fetch

app = typer.Typer(add_completion=False, help="Turn a text into vocabulary items.")
console = Console()

# Output

def print_report(result: ExtractionResult) -> None:
    table = Table(show_lines=False)
    table.add_column("Answer", style="bold")
    table.add_column("Prompt")
    table.add_column("Also accepted", style="dim")
    table.add_column("Context", style="dim", max_width=40)

    for item in result.items:
        table.add_row(item.answer, item.prompt, ", ".join(item.alternates), item.context)

    console.print(table)

    console.print(
        f"\n[bold]{len(result.items)}[/bold] items  "
        f"[yellow]{len(result.skipped)}[/yellow] skipped  "
        f"[red]{len(result.rejected)}[/red] rejected  "
        f"[dim]{result.input_tokens} in / {result.output_tokens} out tokens  "
        f"prompt v{result.prompt_version}[/dim]"
    )

    if result.skipped:
        console.print("\n[yellow]Skipped[/yellow]")
        for entry in result.skipped:
            console.print(f"  {entry.lemma}: {entry.reason}")

    if result.rejected:
        console.print("\n[red]Rejected[/red]")
        for entry in result.rejected:
            console.print(f"  {entry.lemma}: {entry.reason}")

def save_job(user_id: uuid.UUID, text: str, url: str | None, target: str, source: str, lang: str) -> None:
    from curator.db.session import session_scope
    from curator.jobs import run_job

    with session_scope() as session:
        outcome = run_job(
            session,
            user_id,
            text,
            source_url=url,
            target_language=target,
            source_language=source,
            lang=lang,
        )

    print_report(
        ExtractionResult(
            items=outcome.items,
            skipped=outcome.skipped,
            rejected=outcome.rejected,
            input_tokens=outcome.input_tokens,
            output_tokens=outcome.output_tokens,
            prompt_version=outcome.prompt_version,
        )
    )
    cost = "unknown" if outcome.cost_usd is None else f"${outcome.cost_usd:.4f}"
    console.print(
        f"\n[bold]job {outcome.job_id}[/bold]  "
        f"{outcome.cached_items} from the word cache  "
        f"{outcome.known_dropped} already known  cost {cost}"
    )

# Commands

@app.command()
def extract(
    url: str = typer.Option(None, "--url", help="Article URL to read."),
    file: Path = typer.Option(None, "--file", help="Local text file to read."),
    target: str = typer.Option("Spanish", "--target", help="Language being learned."),
    source: str = typer.Option("English", "--source", help="Language of the prompts."),
    lang: str = typer.Option("es", "--lang", help="spaCy language code."),
    limit: int = typer.Option(None, "--limit", help="Maximum items to extract."),
    as_json: bool = typer.Option(False, "--json", help="Print importable JSON instead of a table."),
    save: bool = typer.Option(False, "--save", help="Persist as an extraction job."),
    user: str = typer.Option(None, "--user", help="User id that owns the job."),
) -> None:
    if not url and not file:
        console.print("[red]Pass either --url or --file[/red]")
        raise typer.Exit(code=1)
    if save and not user:
        console.print("[red]--save needs --user[/red]")
        raise typer.Exit(code=1)

    text = fetch.from_url(url) if url else fetch.from_file(file)

    if limit:
        from curator.config import get_settings

        get_settings().max_items_per_text = limit

    if save:
        save_job(uuid.UUID(user), text, url, target, source, lang)
        return

    result = extract_from_text(
        text,
        target_language=target,
        source_language=source,
        lang=lang,
    )

    if as_json:
        payload = [draft.model_dump(exclude_none=False) for draft in result.drafts]
        json.dump(payload, sys.stdout, ensure_ascii=False, indent=2)
        sys.stdout.write("\n")
        return

    print_report(result)

@app.command()
def candidates(
    file: Path = typer.Option(..., "--file", help="Local text file to read."),
    lang: str = typer.Option("es", "--lang", help="spaCy language code."),
    limit: int = typer.Option(60, "--limit"),
) -> None:
    from curator.nlp.tokenize import candidates_from_text, rank_candidates

    text = fetch.from_file(file)
    found = rank_candidates(candidates_from_text(text, lang=lang), limit=limit)

    table = Table()
    table.add_column("Lemma", style="bold")
    table.add_column("POS")
    table.add_column("Zipf")
    table.add_column("Seen")
    table.add_column("Context", style="dim", max_width=50)

    for candidate in found:
        table.add_row(
            candidate.lemma,
            candidate.pos,
            f"{candidate.zipf:.2f}",
            str(candidate.occurrences),
            candidate.context,
        )

    console.print(table)
    console.print(f"\n[bold]{len(found)}[/bold] candidates")

@app.command()
def job(job_id: str = typer.Argument(..., help="Extraction job id.")) -> None:
    from curator.db import repository
    from curator.db.session import session_scope

    with session_scope() as session:
        found = repository.get_job(session, uuid.UUID(job_id))
        if found is None:
            console.print("[red]No such job[/red]")
            raise typer.Exit(code=1)

        console.print(
            f"[bold]{found.status}[/bold]  {found.lang}  prompt v{found.prompt_version}  {found.model}\n"
            f"[dim]created {found.created_at:%Y-%m-%d %H:%M}  "
            f"{found.input_tokens} in / {found.output_tokens} out  "
            f"cost {found.cost_usd if found.cost_usd is not None else 'unknown'}  "
            f"{found.cached_items} from the word cache  "
            f"{found.known_dropped} already known[/dim]"
        )
        if found.error:
            console.print(f"[red]{found.error}[/red]")

        table = Table()
        table.add_column("#", style="dim")
        table.add_column("Answer", style="bold")
        table.add_column("Prompt")
        table.add_column("Status", style="dim")
        for row in found.items:
            table.add_row(str(row.position), row.answer, row.prompt, row.status)
        console.print(table)

if __name__ == "__main__":
    app()