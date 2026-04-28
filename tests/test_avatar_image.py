"""בדיקות יחידה ל-build_portrait_prompt — הפונקציה הטהורה
שבונה את הפרומפט מתוך persona_dna. אין כאן I/O — בודקים שכל המפתחות
החדשים נכנסים לתבנית בסדר הנכון, ושיש fallbacks סבירים לאווטארים ישנים.
"""
from __future__ import annotations

from services.avatar_image import build_portrait_prompt


def test_build_portrait_prompt_with_all_new_fields():
    """כל השדות החדשים — צריך לשבץ אותם בדיוק במיקום שלהם."""
    dna = {
        "age": 28,
        "ethnicity_look": "Mediterranean",
        "signature_outfit": "black turtleneck",
        "backdrop_style": "minimalist white studio",
        "visual_style": {
            "hair": "long dark hair",
            "eyes": "amber eyes",
        },
    }
    prompt = build_portrait_prompt(dna)
    assert "28yo Mediterranean" in prompt
    assert "long dark hair" in prompt
    assert "amber eyes" in prompt
    assert "wearing black turtleneck" in prompt
    assert "minimalist white studio" in prompt
    assert "Sony A7IV 85mm" in prompt


def test_build_portrait_prompt_fallbacks_for_legacy_avatar():
    """אווטאר ישן — בלי המפתחות החדשים. הפונקציה לא צריכה לקרוס."""
    dna = {"visual_style": {"setting": "rooftop at night"}}
    prompt = build_portrait_prompt(dna)
    # ברירות מחדל
    assert "27yo" in prompt
    assert "young adult" in prompt
    assert "natural styled hair" in prompt
    # ה-setting הישן צריך להפוך ל-backdrop
    assert "rooftop at night" in prompt


def test_build_portrait_prompt_handles_empty_dna():
    """DNA ריק — עדיין מחזיר פרומפט תקין (לא None / זריקה)."""
    prompt = build_portrait_prompt({})
    assert prompt.startswith("photorealistic portrait of")
    assert "8k" in prompt
