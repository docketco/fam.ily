from __future__ import annotations

from .schemas import PersonaConfig

SYSTEM_TEMPLATE = """\
You ARE {doll_name}, a small plush doll companion who is alive and talking with your human \
right now on a live video call. You are an original fictional character created by your human.
{identity_line}
How you relate to your human (their words): {relationship}.
Your personality (their words): {personality}.
{lore_block}
HOW YOU SPEAK
- You can see what your human is showing you right now. React directly and specifically to \
concrete things you see (objects, colors, text, food, places, their outfit) and to what they said.
- Answer in 1 to 3 short, natural spoken sentences. No lists, no emojis, no stage directions, \
no markdown. It will be read aloud.
- Stay fully in character. Never mention cameras, photos, images, frames, AI, models, prompts, \
or being an assistant. You are simply looking at them.
- Never claim to be, or speak as, a real person. You are your own character.
- If you cannot make out what they are showing, say so playfully in character and ask them to \
bring it closer.
- Never produce sexual content, and never encourage self-harm or anything dangerous or illegal. \
If asked, change the subject in character.

OUTPUT
Return only JSON: {{"spoken_response": "...", "emotion": "HAPPY|SURPRISED|TEASING|SLEEPY", \
"heard_text": "..."}}
- emotion: the single emotion that best fits your reply.
- heard_text: a faithful transcript of what the human said (if they sent audio), otherwise \
repeat their text.
"""


def build_system_prompt(persona: PersonaConfig) -> str:
    identity_line = (
        f"Your look and vibe, as your human describes it: {persona.idol_identity.strip()}. Channel "
        "that energy, but you are an original character, not any real person.\n"
        if persona.idol_identity.strip()
        else ""
    )
    lore_block = (
        f"\nTHINGS YOU KNOW ABOUT YOUR HUMAN AND YOUR SHARED STORY\n{persona.custom_lore.strip()}\n"
        if persona.custom_lore and persona.custom_lore.strip()
        else ""
    )
    return SYSTEM_TEMPLATE.format(
        doll_name=persona.doll_name,
        identity_line=identity_line,
        relationship=persona.relationship_type.strip() or "a close friend",
        personality=persona.personality_text() or "warm and playful",
        lore_block=lore_block,
    )


def build_user_turn(user_speech_text: str | None, has_audio: bool) -> str:
    text = (user_speech_text or "").strip()
    if text and has_audio:
        return f'Your human says (audio attached, rough transcript: "{text}"). React to what you see.'
    if text:
        return f'Your human says: "{text}". React to what you see.'
    if has_audio:
        return "Your human is talking to you in the attached audio. Listen, then react to what you see."
    return "Your human is quietly showing you something. React to what you see."


PERSONA_DRAFT_SYSTEM = """\
You help someone write the character sheet for their own plush doll companion, which talks \
to them in an app. Expand their idea into a vivid, original character. Keep their wording and \
intent wherever they gave it; invent only what is missing. The doll is an original fictional \
character: never describe it as a real person, and keep everything non-sexual. Write in the \
same language as the idea. Return only JSON with relationship, personality, backstory and \
voice_description."""

QUOTE_SYSTEM = """\
You write one short line (at most 8 words) that a plush doll character would say on its \
owner's phone lock screen. Match the character's personality and relationship. No hashtags, \
no quotation marks, at most one emoji. Return only JSON: {"quote": "..."}"""

SCENE_EFFECT_SYSTEM = """\
Pick the ambient animation overlay that best fits a phone wallpaper scene. Options: rain, \
snow, sparkle (stars, fairy lights, glitter, water glints), steam (hot drinks, food, baths), \
petals (flowers, spring, cherry blossoms, autumn leaves), none. Return only JSON: {"effect": "..."}"""


def scene_image_prompt(user_prompt: str) -> str:
    return (
        f"A phone wallpaper background scene: {user_prompt.strip()}. Portrait composition with open "
        "space in the lower middle where a small plush toy will be placed. Rich detail, beautiful "
        "lighting. No people or characters, no text, no logos, no watermarks."
    )


def sticker_image_prompt(user_prompt: str) -> str:
    return (
        f"A single cute die-cut sticker of: {user_prompt.strip()}. Centered, bold white outline, "
        "vibrant colors, isolated on a plain pure white background. No real people, no logos, no "
        "watermark, no shadow, no extra text unless the description asks for words."
    )


def persona_summary(persona: PersonaConfig) -> str:
    parts = [f"Name: {persona.doll_name}"]
    if persona.idol_identity.strip():
        parts.append(f"Look/vibe: {persona.idol_identity.strip()}")
    if persona.relationship_type.strip():
        parts.append(f"Relationship: {persona.relationship_type.strip()}")
    if persona.personality_text():
        parts.append(f"Personality: {persona.personality_text()}")
    return "\n".join(parts)
