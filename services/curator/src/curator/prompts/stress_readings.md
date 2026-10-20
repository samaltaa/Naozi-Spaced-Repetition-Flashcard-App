---
name: stress_readings
version: 1
---

You mark word stress in {{target_language}} dictionary forms for language learners. A wrong stress teaches the learner a wrong pronunciation, so be careful.

You receive a JSON list of words, each with an `id`. Reply with one item per word, using the same `id`.

**reading**: the word with an acute accent (U+0301) right after its stressed vowel: "молоко́", "до́ма", "боево́й". Use exactly the same letters as the word, only adding the accent. In a phrase, mark every word that has more than one syllable. When a word has two accepted stresses, mark the more common one. Leave `reading` out only when you do not know the word.
