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
        "how many crewnecks did taylor swift buy?",
        "HOW MANY CREWNECKS DID TAYLOR SWIFT BUY?",
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


def test_a_count_follows_the_words_the_question_used():
    jackets = ask("How many jackets do I own?")
    assert jackets["facts"]["count"] == 3
    assert "Rain shell" in jackets["answer"]
    black = ask("How many black jeans do I own?")
    assert black["facts"]["count"] == 1
    assert black["answer"].startswith("One: Black jeans.")
    assert ask("How many black tops do I own?")["answer"].startswith("4 black tops")

    red = ask("How many red jeans do I own?")
    assert red["facts"]["count"] == 0
    assert red["answer"] == "None: you own no red jeans."

    assert ask("How many denim jackets do I own?")["facts"]["count"] == 1
    assert ask("How many trousers do I own?")["facts"]["count"] == 4
    assert ask("How many boots do I own?")["answer"].startswith("2 pairs of boots")
    assert ask("How many dresses do I own?")["intent"] == "count"


def test_a_named_garment_beats_the_occasion_it_belongs_to():
    boots = ask("How many rain boots do I own?")
    assert boots["intent"] == "count"
    assert boots["facts"]["count"] == 1
    assert ask("What do I own for rain?")["intent"] == "occasion"


def test_a_stranger_is_refused_wherever_the_grammar_puts_them():
    for question in (
        "how many crewnecks might taylor swift own?",
        "how many crewnecks would beyonce own?",
        "how many jackets does Elon Musk own?",
        "What did I spend at Zara?",
        "how many gucci jackets do i own?",
        "can you count crewnecks rihanna owns?",
        "what do i own for rain, paris?",
        "how many balenciaga shoes do i own?",
        "how much have i spent if bitcoin crashes?",
        "what do i own for rain when tokyo floods?",
        "how many jackets do i own if oprah asks?",
        "what is my best purchase unless tesla crashes?",
        "how many jackets do i own, say, chanel?",
        "how many boots do i own, namely, timberland?",
    ):
        assert ask(question)["intent"] == "unknown", question


def test_a_colour_the_closet_lacks_is_a_question_not_a_stranger():
    assert ask("How many suede boots do I own?")["facts"]["count"] == 0
    assert ask("How many navy jackets do I own?")["facts"]["count"] == 0
    both = ask("How many black or white tops do I own?")
    assert both["facts"]["count"] == 6
    assert both["answer"].startswith("6 black or white tops")
    assert ask("Could someone count my crewnecks?")["intent"] == "count"
    assert ask("How many gray crewnecks do I own?")["answer"] == "One: Grey crewneck. $45, 5 wears."
    mixed = ask("How many black or white cotton tops do I own?")
    assert mixed["facts"]["count"] == 0
    fabrics = ask("How many cotton or wool crewnecks do I own?")
    assert fabrics["facts"]["count"] == 3
    two = ask("How many grey or charcoal cotton or wool crewnecks do I own?")
    assert two["answer"].startswith("3 charcoal or grey cotton or wool crewnecks")


def test_a_quality_the_question_rules_out_narrows_the_rail():
    assert ask("How many jackets do I own excluding denim?")["facts"]["count"] == 2
    rest = ask("How many tops are not black?")
    assert rest["intent"] == "count"
    assert rest["answer"].startswith("8 non-black tops")


def test_plain_english_around_a_wardrobe_question_is_not_a_stranger():
    """Refusal reads noun slots, so ordinary words elsewhere cost nothing."""
    answerable = {
        "Quickly count my crewnecks, please.": "count",
        "How many jackets do I currently possess?": "count",
        "How much have I splurged on clothes?": "spend",
        "What percentage of purchases am I returning?": "returns",
        "How much money have I saved by skipping purchases?": "saved",
        "Which clothes have I never worn even once?": "unworn",
        "What clothes are gathering dust in my closet?": "unworn",
        "What have I been wearing the least?": "unworn",
        "Which of my clothes haven't I worn?": "unworn",
        "Can you tally my jackets?": "count",
        "How many jeans do I actually have right now?": "count",
        "Can you enumerate my jackets?": "count",
        "Could you recount my jackets please?": "count",
        "How many jeans have I got at present?": "count",
        "How much have I forked out on clothes?": "spend",
        "What clothes are collecting dust?": "unworn",
        "Which items have not been worn?": "unworn",
        "Which clothes am I not wearing?": "unworn",
        "What don't I wear anymore?": "unworn",
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
