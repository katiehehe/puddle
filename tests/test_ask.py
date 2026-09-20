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


def test_late_night_answer_compares_against_the_rest_of_the_day():
    reply = ask("What happens when I shop late at night?")
    stat = reply["facts"]
    assert reply["intent"] == "late_night"
    assert stat["late_rate"] > stat["daytime_rate"]
    assert f"{round(100 * stat['daytime_rate'])}% the rest of the day" in reply["answer"]


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


def test_wardrobe_words_in_another_subject_are_not_an_answer():
    # "rain", "buy", "value" and "tell me about" all read as wardrobe questions
    # unless the question is about the shopper's own things.
    for question in (
        "Should I buy Tesla stock?",
        "Will it rain tomorrow in Boston?",
        "What is Tesla stock value?",
        "Tell me about quantum physics",
        "What do I need to buy Tesla stock?",
        "What is my best buy in cryptocurrency?",
        "How much have I spent on Bitcoin?",
        "What do I own for rain on Mars?",
        "How much have I spent buying more Bitcoin?",
        "What do I own for rain while visiting Mars?",
        "How many jackets does Elon Musk own?",
        "How much have I spent on groceries?",
        "How many crewnecks did Taylor Swift buy?",
        "What do I own for rain near Mars?",
        "What is my best value among Tesla stocks?",
        "What did I spend at Zara?",
    ):
        assert ask(question)["intent"] == "unknown", question


def test_the_questions_it_does_answer_survive_that_guard():
    answerable = {
        "What am I missing?": "gaps",
        "What's my best buy?": "value",
        "What should I wear to an interview?": "occasion",
        "Can I donate anything?": "unworn",
        "How much is my closet worth?": "spend",
        "Tell me about my closet": "summary",
        "How many crewnecks do I currently own?": "count",
        "Do I own anything suitable for rain?": "occasion",
        "What is my return rate?": "returns",
        "How much have I spent in total?": "spend",
        "How much money have I saved altogether?": "saved",
        "Could you please count my crewnecks?": "count",
        "How many jackets do I own?": "count",
        "Do I own more than one puffer jacket?": "count",
        "WHAT DO I OWN FOR RAIN?": "occasion",
    }
    for question, intent in answerable.items():
        assert ask(question)["intent"] == intent, question


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
