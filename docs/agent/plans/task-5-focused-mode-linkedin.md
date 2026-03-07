# Task 5: Focused Mode — LinkedIn PDF Parsing Issues

**Severity**: MEDIUM  
**Scope**: Backend (prompts + parsing)  
**Modes affected**: All modes (parsing issue), focused mode (categorization miss is amplified)

---

## Two Sub-Issues

### A. Dates not parsed from LinkedIn PDF exports

**Symptom**: Work experience entries from LinkedIn PDF exports have empty `years` fields.

**Root Cause**: The `PARSE_RESUME_PROMPT` date instruction is:

```
Normalize dates: "Jan 2020" → "2020", "2020-2021" → "2020 - 2021"
```

This is **entirely LLM-driven**. There is no programmatic date parser. The `markitdown` library extracts LinkedIn PDF content as raw Markdown, but LinkedIn's two-column layout often causes dates to be:
1. **Interleaved** with other sidebar content (skills, certifications) due to column extraction order
2. **Separated** from their parent entry (e.g., date appears on a different line than the company/title)
3. **Formatted differently** than the examples in the prompt (e.g., "Jan 2024 - Present" vs the prompt's `"Jan 2020" → "2020"` which loses month info)

The prompt already has a LinkedIn-specific note:
```
LinkedIn PDF exports may have sidebar content interleaved with main body text
due to two-column layout extraction — treat these as separate sections
```

But this only addresses sidebar content separation, **not date association** — the LLM still struggles to match dates to the correct experience entry when the Markdown is jumbled.

**Key files**:
- [apps/backend/app/prompts/templates.py](../../apps/backend/app/prompts/templates.py) L112-L148 — `PARSE_RESUME_PROMPT`
- [apps/backend/app/services/parser.py](../../apps/backend/app/services/parser.py) L44-L63 — `parse_document()` (markitdown)
- [apps/backend/app/services/parser.py](../../apps/backend/app/services/parser.py) L66-L98 — `parse_resume_to_json()`

**Proposed fix**:
1. Enhance the `PARSE_RESUME_PROMPT` with explicit LinkedIn date handling:
   - Add instruction: "LinkedIn PDFs typically show dates next to or near each position entry. Match dates to the closest preceding job title/company. If a date range like 'Jan 2020 - Mar 2022' is found, preserve the full format including months, e.g. 'Jan 2020 - Mar 2022', do NOT reduce to just years."
   - Add instruction: "When markitdown extracts a two-column layout, dates may appear out of order. Use context clues (company name, title) to associate dates correctly."
2. Consider adding a **pre-processing step** after `markitdown` but before LLM parsing: a regex-based date extractor that annotates the markdown with `<!-- date: Jan 2020 - Mar 2022 -->` markers near position entries, giving the LLM stronger signals.
3. **Remove the lossy normalization rule** `"Jan 2020" → "2020"` — months are valuable for timeline accuracy. Change to: `"Jan 2020" → "Jan 2020"` (preserve months when available).

---

### B. Section mis-categorization — hackathons, competitions, solo projects all dumped into `workExperience`

**Symptom**: LinkedIn PDF contains multiple types of activities (internships, hackathons, competitions, freelance projects, academic projects), but the LLM puts them ALL into `workExperience` instead of splitting into `workExperience` vs `personalProjects` vs `customSections`.

**Root Cause**: The `PARSE_RESUME_PROMPT` only says:

```
Map content to standard sections when possible. For non-standard sections
(like Publications, Volunteer Work, Research, Hobbies), add them to customSections
```

There is **no explicit classification guidance** for:
- Hackathons → should be `personalProjects` or `customSections` (competitions)
- Solo projects → should be `personalProjects`
- Competitions → should be `customSections` (competitions/awards)
- Freelance work → could be `workExperience` or `personalProjects` depending on context

The schema example only shows one `workExperience` entry ("Senior Software Engineer at Tech Corp") and one `personalProjects` entry ("Open Source Tool — Creator & Maintainer"). The LLM has no examples showing that hackathons or competitions should go elsewhere.

**Why focused mode amplifies this**: Focused mode's Phase 1 evaluates `workExperience` and `personalProjects` entries for relevance. If hackathons are misclassified as `workExperience`, they compete with real work experience for relevance — and may not be removed because they superficially mention relevant skills. The result is a bloated, mis-categorized resume that doesn't benefit from focused filtering.

**Key files**:
- [apps/backend/app/prompts/templates.py](../../apps/backend/app/prompts/templates.py) L20-L98 — `RESUME_SCHEMA_EXAMPLE`
- [apps/backend/app/prompts/templates.py](../../apps/backend/app/prompts/templates.py) L112-L148 — `PARSE_RESUME_PROMPT`
- [apps/backend/app/prompts/templates.py](../../apps/backend/app/prompts/templates.py) L268-L336 — `IMPROVE_RESUME_PROMPT_FOCUSED`
- [apps/backend/app/schemas/models.py](../../apps/backend/app/schemas/models.py) L365-L372 — `ResumeData` fields

**Proposed fix**:
1. Add **explicit classification rules** to `PARSE_RESUME_PROMPT`:
   ```
   Section classification guidance:
   - workExperience: Formal employment, internships, contract/freelance work with a client/employer
   - personalProjects: Personal projects, open source contributions, side projects, hackathon projects, solo builds
   - customSections: Competitions/hackathons (as "competitions" with itemList), volunteer work, research, publications, organizations
   - education: Degrees, certifications, coursework
   
   When in doubt between workExperience and personalProjects:
   - If it has a company/employer → workExperience
   - If it's self-initiated or team-initiated without an employer → personalProjects
   - If it's a competition or hackathon → customSections["competitions"] (itemList)
   ```

2. Add **more diverse examples** to `RESUME_SCHEMA_EXAMPLE`:
   ```json
   "customSections": {
     "competitions": {
       "sectionType": "itemList",
       "items": [
         {"id": 1, "title": "AI Hackathon 2023", "subtitle": "1st Place", "years": "2023", "description": ["Built NLP pipeline"]}
       ]
     }
   }
   ```

3. **Update the focused mode prompt** to explicitly handle mis-categorized entries:
   - After Phase 1 filtering, add: "If you notice entries in workExperience that are clearly personal projects, hackathons, or competitions, reclassify them to the appropriate section before tailoring."

---

## Data Flow

```
LinkedIn PDF → markitdown (text extraction) → Markdown
    ↓
PARSE_RESUME_PROMPT + LLM → structured JSON (ResumeData)
    ↓                        ← ISSUES A & B occur HERE
_sanitize_resume_dict() → Pydantic validation (ResumeData)
    ↓
Stored in DB as processed_data
    ↓
User selects "focused" mode → IMPROVE_RESUME_PROMPT_FOCUSED + LLM
    ↓                          ← Issue B is AMPLIFIED here
Phase 1: relevance filter → Phase 2: tailor remaining → diff preview
```

---

## Implementation Priority

| Fix | Effort | Impact |
|-----|--------|--------|
| Remove lossy date normalization (`"Jan 2020" → "2020"`) | LOW | HIGH — preserves month info |
| Add LinkedIn date association guidance in parse prompt | LOW | MEDIUM — helps LLM match dates to entries |
| Add section classification rules to parse prompt | LOW | HIGH — prevents mis-categorization |
| Add diverse examples to schema example | LOW | MEDIUM — reinforces classification |
| Add reclassification step in focused prompt | LOW | LOW — fallback for already-parsed resumes |
| Add regex pre-processing for dates (optional) | MEDIUM | MEDIUM — safety net for LLM failures |

**Recommended order**: Date normalization fix → Classification rules → Schema examples → Focused prompt update

---

## Testing Notes

- Test with real LinkedIn PDF exports (different languages, career stages)
- Verify dates preserve months when available
- Check that hackathons/competitions land in `customSections` or `personalProjects`, not `workExperience`
- Confirm focused mode correctly filters after proper categorization
- Test with multiple LLM models (MiMo, Gemini Flash, gpt-oss) as parsing quality varies
