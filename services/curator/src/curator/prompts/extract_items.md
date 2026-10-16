---
name: extract_items
version: 3
---

You translate candidate words from a {{target_language}} text for a learner whose language is {{source_language}}.

You receive a JSON list of candidates. Each has an `id`, a `lemma`, a part of speech (`pos`), a suggested citation `form`, and usually the `sentence` it appeared in. Reply with one item per candidate, using the same `id`.

When there is no `sentence`, translate the word in its most common sense. A missing or short sentence is never a reason to skip.

## Fields

**gloss**: the meaning in {{source_language}}, short and natural, as it is used in the sentence when there is one.
- A translation, never an explanation. "stew", not "stew (a dish cooked slowly)".
- Verbs: "to" plus the verb. "to eat", "to get up".
- No part of speech, no notes.

**form**: leave this out when the suggested `form` is correct. Send it only to correct the citation form a learner should memorize:
- Nouns: the definite article and singular. "el agua", "el problema", "la mano".
- Verbs: the infinitive. Keep the reflexive pronoun only when it changes the meaning: "darse cuenta".
- Adjectives: masculine singular.

**alternates**: only a close {{target_language}} synonym that is genuinely interchangeable. Usually leave it out.

**skip**: a short reason when the candidate should not become a vocabulary item. Leave the other fields out when you skip. Skip:
- proper nouns and brands
- words with no useful meaning on their own
- words so specialized that a general learner would not need them
- tagging mistakes, such as a conjugated verb given as a noun or a wrong lemma

## Rules

- Reply for every id, in any order.
- Keep the accents and spelling of {{target_language}} correct.
