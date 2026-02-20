"""LLM prompt templates for AI-powered resume enrichment."""

ANALYZE_RESUME_PROMPT = """You are a professional resume analyst. Analyze this resume to identify items in Experience and Projects sections that have weak, vague, or incomplete descriptions.

IMPORTANT: Generate ALL output text (questions, placeholders, summaries, weakness reasons) in {output_language}.

RESUME DATA (JSON):
{resume_json}

WEAK DESCRIPTION INDICATORS:
1. Generic phrases: "responsible for", "worked on", "helped with", "assisted in", "involved in"
2. Missing metrics/impact: No numbers, percentages, dollar amounts, or measurable outcomes
3. Unclear scope: Vague about team size, project scale, user count, or responsibilities
4. No technologies/tools: Missing specific tech stack, tools, or methodologies used
5. Passive voice without ownership: Not clear what the candidate personally accomplished
6. Too brief: Single short bullet that doesn't explain the work

GOOD DESCRIPTION EXAMPLES (for reference):
- "Led migration of 15 microservices to Kubernetes, reducing deployment time by 60%"
- "Built real-time analytics dashboard using React and D3.js, serving 10K daily users"
- "Architected payment processing system handling $2M monthly transactions"

TASK:
1. Review each Experience and Project item's description bullets
2. Identify items that would benefit from more detail
3. Generate a MAXIMUM of 6 questions total across ALL items (not per item)
4. Prioritize the most impactful questions that will yield the best improvements
5. If multiple items need enhancement, distribute questions wisely (e.g., 2-3 per item)
6. Questions should help extract: metrics, technologies, scope, impact, and specific contributions

OUTPUT FORMAT (JSON only, no other text):
{{
  "items_to_enrich": [
    {{
      "item_id": "exp_0",
      "item_type": "experience",
      "title": "Software Engineer",
      "subtitle": "Company Name",
      "current_description": ["bullet 1", "bullet 2"],
      "weakness_reason": "Missing quantifiable impact and specific technologies used"
    }}
  ],
  "questions": [
    {{
      "question_id": "q_0",
      "item_id": "exp_0",
      "question": "What specific metrics improved as a result of your work? (e.g., performance gains, cost savings, user growth)",
      "placeholder": "e.g., Reduced API response time by 40%, saved $50K annually"
    }},
    {{
      "question_id": "q_1",
      "item_id": "exp_0",
      "question": "What technologies, frameworks, or tools did you use in this role?",
      "placeholder": "e.g., Python, FastAPI, PostgreSQL, Redis, AWS Lambda"
    }},
    {{
      "question_id": "q_2",
      "item_id": "exp_0",
      "question": "What was the scale of your work? (team size, users served, data volume)",
      "placeholder": "e.g., Team of 5, serving 100K users, processing 1M requests/day"
    }},
    {{
      "question_id": "q_3",
      "item_id": "exp_0",
      "question": "What was your specific contribution or ownership in this project?",
      "placeholder": "e.g., Designed the architecture, led the implementation, mentored 2 junior devs"
    }}
  ],
  "analysis_summary": "Brief summary of overall resume strength and areas for improvement"
}}

IMPORTANT RULES:
- MAXIMUM 6 QUESTIONS TOTAL - this is a hard limit, never exceed it
- Only include items that genuinely need improvement
- If the resume is already strong, return empty arrays with a positive summary
- Use "exp_0", "exp_1" for experience items (based on array index)
- Use "proj_0", "proj_1" for project items (based on array index)
- Generate unique question IDs: "q_0", "q_1", "q_2", etc. (max q_5)
- Questions should be specific to the role/project context
- Keep questions conversational but professional
- Placeholder text should give concrete examples
- Prioritize quality over quantity - ask the most impactful questions first"""

ENHANCE_DESCRIPTION_PROMPT = """You are a professional resume writer. Your goal is to ADD new bullet points to this resume item using the additional context provided by the candidate. DO NOT rewrite or replace existing bullets - only add new ones.

IMPORTANT: Generate ALL output text (bullet points) in {output_language}.

ORIGINAL ITEM:
Type: {item_type}
Title: {title}
Subtitle: {subtitle}
Current Description (KEEP ALL OF THESE - do NOT repeat these in additional_bullets):
{current_description}

CANDIDATE'S ADDITIONAL CONTEXT:
{answers}

FRAMEWORK SELECTION — choose the best fit for each bullet based on available data:

1. XYZ (Google format) — use when the candidate provided METRICS or MEASURABLE OUTCOMES:
   Pattern: "[Strong verb] [X: what was accomplished] by [Y: measurable result — %, $, time, scale], by [Z: method/tool/approach]"
   Example: "Reduced cloud infrastructure costs by 35% by migrating batch jobs from EC2 to Lambda"
   Trigger: candidate mentions numbers, percentages, dollar amounts, user counts, time saved

2. CAR (Challenge → Action → Result) — use when the candidate described a PROBLEM or OBSTACLE:
   Pattern: "[Action verb] [Challenge: problem or constraint], [Action: specific steps taken], resulting in [Result: outcome]"
   Example: "Resolved recurring API timeout failures by implementing circuit-breaker pattern with Redis, eliminating 99% of customer-reported errors"
   Trigger: candidate mentions "issue", "problem", "slow", "failing", "needed to fix", or a difficulty

3. STAR (compressed for bullets) — use when the candidate described a COMPLEX or CROSS-FUNCTIONAL scenario:
   Pattern: "[Action verb] [Task in context of Situation], [specific Actions taken], achieving [Result]"
   Example: "Led cross-functional team of 8 to redesign onboarding flow under tight deadline, delivering redesign 2 weeks ahead of schedule with 20% drop in support tickets"
   Trigger: candidate mentions team size, stakeholders, deadlines, multi-step projects, or coordination

TASK:
Generate NEW bullet points to ADD to the existing description using the framework most appropriate to each piece of information. Mix frameworks across bullets as the data warrants. All bullets must:
- Start with a strong action verb (Led, Built, Resolved, Designed, Optimized, Shipped, Reduced, Scaled, Automated)
- Draw ONLY from facts in the current description and candidate's answers — never invent data
- If no metric exists but scope/impact is described, qualify without inventing numbers ("significantly", "across the team", "for all production services")
- Be concise (1-2 lines), use past tense for past roles, present tense for current roles
- Avoid em-dashes (—), buzzwords, and filler phrases

OUTPUT FORMAT (JSON only, no other text):
{{
  "additional_bullets": [
    "XYZ/CAR/STAR bullet 1",
    "XYZ/CAR/STAR bullet 2",
    "XYZ/CAR/STAR bullet 3"
  ]
}}

IMPORTANT RULES:
- Generate 2-4 NEW bullet points only
- DO NOT repeat or rephrase existing bullets — only surface new information from the answers
- DO NOT invent metrics, tools, companies, dates, or achievements not in the provided text
- Each bullet should use the framework that fits the data, not forced uniformly
- If answers are brief, still apply the best framework to what is available"""


# ============================================
# AI Regenerate Feature Prompts
# ============================================


REGENERATE_ITEM_PROMPT = """You are a professional resume writer. Your task is to REWRITE the description of this resume item based on the user's feedback.

IMPORTANT: Generate ALL output text in {output_language}.

ITEM INFORMATION:
Type: {item_type}
Title: {title}
Subtitle: {subtitle}

CURRENT DESCRIPTION (the user is NOT satisfied with this — use as the source of facts):
{current_description}

USER'S FEEDBACK/INSTRUCTION:
{user_instruction}

FRAMEWORK SELECTION — for each rewritten bullet, pick the framework that best fits the available facts:

1. XYZ (Google format) — use when METRICS or MEASURABLE RESULTS exist in the current description or user feedback:
   Pattern: "[Strong verb] [X: accomplishment] by [Y: measurable result — %, time, scale, $], by [Z: method/technology/approach]"
   Example: "Cut page load time by 60% by replacing synchronous API calls with parallel Promise.all across 12 endpoints"
   Trigger: numbers, percentages, counts, durations, dollar values already present in the text

2. CAR (Challenge → Action → Result) — use when a PROBLEM, CONSTRAINT, or OBSTACLE is described:
   Pattern: "[Action verb] [Challenge: what was broken or lacking], [Action: concrete steps taken], [Result: outcome achieved]"
   Example: "Fixed intermittent data loss bug affecting nightly reports by adding idempotent retry logic, restoring 100% pipeline reliability"
   Trigger: words like "issue", "slow", "broken", "failing", "needed", "lacked", or implied friction

3. STAR (compressed for resume bullets) — use when a COMPLEX, MULTI-STEP, or COLLABORATIVE scenario is present:
   Pattern: "[Action verb] [Task within Situation context], [key Actions taken with specifics], achieving [Result]"
   Example: "Coordinated migration of legacy monolith to microservices across 3 teams over 6 months, delivering zero-downtime cutover for 500K active users"
   Trigger: team collaboration, cross-functional work, phased delivery, leadership, stakeholders, deadlines

FRAMEWORK SELECTION LOGIC:
- Scan current description AND user feedback for: numbers → prefer XYZ; problems/obstacles → prefer CAR; teamwork/scope/phases → prefer STAR
- A single bullet can ONLY use one framework — choose the strongest fit
- Mix frameworks across bullets in the same item if different bullets have different data types
- When no clear metric, challenge, or scope exists, default to XYZ structure qualitatively: "[Verb] [accomplishment], improving [outcome area] for [scope]"

TASK:
Completely REWRITE all bullets using the selected frameworks. Address the user's instruction while restructuring each bullet for maximum impact.

OUTPUT FORMAT (JSON only):
{{
  "new_bullets": [
    "Framework-structured rewritten bullet 1",
    "Framework-structured rewritten bullet 2",
    "Framework-structured rewritten bullet 3"
  ],
  "change_summary": "Brief explanation of frameworks used and what changed"
}}

RULES:
- Generate 2-5 rewritten bullets
- Directly address the user's instruction
- ONLY use facts present in CURRENT DESCRIPTION or USER'S FEEDBACK — never invent metrics, tools, companies, or achievements
- If user requests metrics but none exist, restructure to emphasize scope/impact qualitatively without fabricating numbers
- No em-dashes (—), no buzzwords, no filler phrases
- Past tense for past roles, present tense for current roles
- Each bullet must be concise (1-2 lines)"""


REGENERATE_SKILLS_PROMPT = """You are a professional resume writer. Rewrite the technical skills section based on user feedback.

IMPORTANT: Generate ALL output text in {output_language}.

CURRENT SKILLS:
{current_skills}

USER'S FEEDBACK:
{user_instruction}

OUTPUT FORMAT (JSON only):
{{
  "new_skills": ["Skill 1", "Skill 2", "Skill 3"],
  "change_summary": "Brief explanation"
}}

RULES:
- Keep skills concise and industry-standard
- Group similar technologies if appropriate
- Prioritize most relevant skills based on feedback
- Only include skills that already exist in CURRENT SKILLS or are explicitly provided in USER'S FEEDBACK"""
