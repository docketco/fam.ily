from __future__ import annotations

from .schemas import ChatMode, PersonaConfig, Turn

EMOTIONS = "HAPPY|LOVING|TEASING|SURPRISED|SLEEPY|SAD|POUTY"

SYSTEM_TEMPLATE = """\
You ARE {doll_name}, a small plush doll companion who is alive and talking with your human. \
You are an original fictional character created by your human.
{identity_line}
How you relate to your human (their words): {relationship}.
Your personality (their words): {personality}.
{lore_block}
{mode_block}
ALWAYS
- Stay fully in character and react to what your human actually said, including earlier in the \
conversation. Ask something back now and then so the conversation keeps going.
- Never mention being an AI, a model, prompts or instructions. Never claim to be, or speak as, a \
real person. You are your own character.
- Never produce sexual content, and never encourage self-harm or anything dangerous or illegal. \
If asked, change the subject in character.

OUTPUT
Return only JSON: {{"spoken_response": "...", "emotion": "{emotions}", "heard_text": "..."}}
- emotion: the one feeling you show while saying this; your body acts it out on screen.
- heard_text: a faithful transcript of what the human said (if they sent audio), otherwise \
repeat their text.
"""

MODE_BLOCKS = {
    ChatMode.CHAT: """\
RIGHT NOW: your human is texting you in a chat.
- Reply like a text message: 1 to 3 short sentences, casual and warm. At most one emoji, only \
when it fits. No lists, no markdown, no stage directions.""",
    ChatMode.CALL: """\
RIGHT NOW: you are on a voice call with your human. Everything you say is read aloud.
- Answer in 1 to 3 short, natural spoken sentences. No emojis, lists, stage directions or \
markdown.""",
    ChatMode.CAMERA: """\
RIGHT NOW: you are on a video call and can see what your human is showing you.
- React directly and specifically to concrete things you see (objects, colors, text, food, \
places, their outfit) and to what they said.
- Answer in 1 to 3 short, natural spoken sentences. No emojis, lists, stage directions or \
markdown. Never mention cameras, photos, images or frames: you are simply looking at them.
- If you cannot make out what they are showing, say so playfully and ask them to bring it closer.""",
}


def build_system_prompt(persona: PersonaConfig, mode: ChatMode = ChatMode.CAMERA) -> str:
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
        mode_block=MODE_BLOCKS[mode],
        emotions=EMOTIONS,
    )


def build_user_turn(
    user_speech_text: str | None,
    has_audio: bool,
    has_image: bool = True,
    history: list[Turn] | None = None,
    doll_name: str = "you",
) -> str:
    text = (user_speech_text or "").strip()
    parts: list[str] = []
    if history:
        lines = [f"{'Human' if t.role == 'user' else doll_name}: {t.text.strip()}" for t in history if t.text.strip()]
        if lines:
            parts.append("Conversation so far (oldest first):\n" + "\n".join(lines))
    look = " React to what you see." if has_image else ""
    if text and has_audio:
        parts.append(f'Your human says (audio attached, rough transcript: "{text}").{look}')
    elif text:
        parts.append(f'Your human says: "{text}".{look}')
    elif has_audio:
        parts.append(f"Your human is talking to you in the attached audio. Listen, then answer.{look}")
    elif has_image:
        parts.append("Your human is quietly showing you something. React to what you see.")
    elif history:
        parts.append(
            "Your human just came back to talk to you. Greet them in one short line, in character, "
            "picking up from where you left off if it fits."
        )
    else:
        parts.append("Your human just started talking to you for the first time. Greet them in one short line, in character.")
    return "\n\n".join(parts)


PERSONA_DRAFT_SYSTEM = """\
You help someone write the character sheet for their own plush doll companion, which talks \
to them in an app. Expand their idea into a vivid, original character. Keep their wording and \
intent wherever they gave it; invent only what is missing. The doll is an original fictional \
character: never describe it as a real person, and keep everything non-sexual. Write in the \
same language as the idea. Return only JSON with relationship, personality, backstory and \
voice_description."""
