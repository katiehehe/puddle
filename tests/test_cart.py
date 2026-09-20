"""The staging rail: things you're thinking about, reviewed but not owned."""

from fastapi.testclient import TestClient

from brain.app import app

client = TestClient(app)


def _stage(**kwargs):
    body = {"title": "charcoal wool blazer", "price": 220} | kwargs
    res = client.post("/cart", json=body)
    assert res.status_code == 200, res.text
    return res.json()["item"]


def test_staged_items_are_listed_with_a_review():
    staged = _stage()
    cart = client.get("/cart").json()["items"]
    row = next(i for i in cart if i["id"] == staged["id"])
    assert row["review"]["verdict"]
    assert row["review"]["stance"] in ("for", "think", "against")


def test_staging_never_touches_the_closet_or_purchases():
    staged = _stage()
    assert staged["id"] not in [i["id"] for i in client.get("/closet").json()["closet"]]
    assert staged["id"] not in [p["id"] for p in client.get("/purchases").json()["purchases"]]


def test_buying_moves_it_off_the_rail_into_the_closet():
    staged = _stage()
    bought = client.post(f"/cart/{staged['id']}/buy")
    assert bought.status_code == 200, bought.text
    purchase = bought.json()["purchase"]
    assert purchase["in_closet"] is True
    assert purchase["bought_at"]
    assert staged["id"] not in [i["id"] for i in client.get("/cart").json()["items"]]
    assert staged["id"] in [i["id"] for i in client.get("/closet").json()["closet"]]


def test_removing_takes_it_off_the_rail():
    staged = _stage()
    assert client.delete(f"/cart/{staged['id']}").status_code == 200
    assert staged["id"] not in [i["id"] for i in client.get("/cart").json()["items"]]


def test_the_rail_is_empty_until_you_park_something():
    assert client.get("/cart").json()["items"] == []


def test_unnameable_things_get_refused_like_purchases():
    res = client.post("/cart", json={"title": "asdf qwerty", "price": 10})
    assert res.status_code == 422


def test_buying_or_removing_nothing_is_a_404():
    assert client.post("/cart/cart_u_nope/buy").status_code == 404
    assert client.delete("/cart/cart_u_nope").status_code == 404


def test_the_review_is_the_full_advice_not_a_summary():
    """The review used to be trimmed to a verdict and two reasons; a cart item
    now carries the same shape a checkout score does, so it can be opened up
    to the same numbers as the desk instead of a one-line summary."""
    staged = _stage()
    row = next(i for i in client.get("/cart").json()["items"] if i["id"] == staged["id"])
    review = row["review"]
    assert "numbers" in review and "ev" in review["numbers"]
    assert "per_wear" in review
    assert isinstance(review["reasons"], list) and review["reasons"]
    assert isinstance(review["reasons"][0], dict) and "text" in review["reasons"][0]


def test_editing_a_staged_item_updates_it_and_its_review():
    staged = _stage(price=220)
    res = client.patch(f"/cart/{staged['id']}", json={"price": 180, "size": "M"})
    assert res.status_code == 200, res.text
    item = res.json()["item"]
    assert item["price"] == 180
    assert item["size"] == "M"
    assert item["review"]["subhead"] == "$180 charcoal wool blazer"


def test_renaming_a_staged_item_reworks_its_attributes():
    staged = _stage(title="grey wool sweater", price=60)
    res = client.patch(f"/cart/{staged['id']}", json={"title": "rain jacket"})
    assert res.status_code == 200, res.text
    item = res.json()["item"]
    assert item["kind"] == "rain_outer"
    assert item["rain_ok"] is True


def test_renaming_to_something_unrecognisable_is_refused_and_nothing_changes():
    staged = _stage(title="grey wool sweater", price=60)
    res = client.patch(f"/cart/{staged['id']}", json={"title": "zzz qqq"})
    assert res.status_code == 422
    unchanged = next(i for i in client.get("/cart").json()["items"] if i["id"] == staged["id"])
    assert unchanged["title"] == "grey wool sweater"


def test_editing_something_not_on_the_rail_is_a_404():
    assert client.patch("/cart/cart_u_nope", json={"price": 5}).status_code == 404
