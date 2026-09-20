from fastapi.testclient import TestClient

from brain.app import app

client = TestClient(app)


def ask(question, **kwargs):
    return client.post("/ask", json={"question": question, **kwargs}).json()


def test_occasion_answer_names_what_covers_it():
    reply = ask("What do I own for rain?")
    assert reply["intent"] == "occasion"
    assert reply["facts"]["state"] == "rain"
    assert reply["facts"]["covers"]
    assert reply["facts"]["covers"][0] in reply["answer"]


def test_gap_answer_is_the_one_the_closet_actually_has():
    reply = ask("What should I wear to an interview?")
    assert reply["intent"] == "occasion"
    assert reply["facts"]["covers"] == []
    assert "formal" in reply["answer"].lower()


def test_counts_cite_the_pile_and_its_wears():
    reply = ask("How many crewnecks do I own?")
    assert reply["intent"] == "count"
    assert reply["facts"]["count"] == 3
    assert "Charcoal crewneck" in reply["answer"]


def test_return_answer_carries_the_rate_it_was_derived_from():
    reply = ask("Do I return a lot of stuff?")
    stat = reply["facts"]
    assert reply["intent"] == "returns"
    assert f"{round(100 * stat['baseline'])}%" in reply["answer"]
    assert stat["returned"] < stat["bought"]


def test_late_night_answer_compares_against_the_baseline():
    reply = ask("What happens when I shop late at night?")
    assert reply["intent"] == "late_night"
    assert reply["facts"]["late_rate"] > reply["facts"]["baseline"]


def test_pond_is_empty_until_something_is_skipped():
    assert ask("How much have I saved?")["facts"]["skips"] == 0
    client.post("/actions", json={"event_id": "e_ask_1", "item_id": "cand_boots", "action": "skip"})
    reply = ask("What's in the pond?")
    assert reply["facts"] == {"saved": 128, "skips": 1}
    assert "$128" in reply["answer"]


def test_accuracy_answer_does_not_invent_a_record():
    reply = ask("How often are you right?")
    assert reply["facts"] == {"right": 0, "total": 0, "pct": None}
    assert "Nothing graded yet" in reply["answer"]


def test_unanswerable_questions_get_no_answer_at_all():
    reply = ask("What's the weather in Boston?")
    assert reply["intent"] == "unknown"
    assert reply["facts"] == {}
    assert reply["examples"]


def test_item_questions_still_go_to_the_checkout_handler():
    reply = ask("Why should I skip these?", item_id="cand_boots", now_hour=23)
    assert reply["intent"] == "explain"
    assert reply["decision"] == "skip"


def test_checkout_falls_back_to_wardrobe_answers():
    reply = client.post(
        "/voice/respond",
        json={"transcript": "What do I never wear?", "item_id": "cand_boots", "now_hour": 23},
    ).json()
    assert reply["intent"] == "unworn"
    assert reply["scope"] == "wardrobe"
    assert "never worn" in reply["answer"]
