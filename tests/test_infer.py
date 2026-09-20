"""Attribute inference for items read off a page we do not control."""

from datetime import datetime

from brain.app import _context, recommend
from brain.catalog import CLOSET, STOREFRONT, coerce_item
from brain.infer import infer


def test_unrecognised_garment_returns_none_rather_than_guessing():
    """Silence is the cheap mistake. Confidently pricing the risk of a thing we
    could not identify is the expensive one."""
    assert infer("Quantum flux capacitor") is None
    assert infer("") is None
    assert infer(None) is None


def test_coerce_item_still_refuses_what_infer_cannot_name():
    assert coerce_item({"title": "Quantum flux capacitor", "price": 10}) is None


def test_rain_words_beat_warmth_words_where_they_overlap():
    """'Rain jacket' and 'puffer jacket' both contain 'jacket'; the specific
    rule has to win or every coat becomes the same garment."""
    assert infer("Packable rain jacket")["kind"] == "rain_outer"
    assert infer("Packable rain jacket")["rain_ok"] is True
    assert infer("Down puffer jacket")["kind"] == "puffer"
    assert infer("Denim jacket")["kind"] == "light_jacket"


def test_material_words_shift_warmth_and_formality():
    assert infer("Merino wool sweater")["warmth"] > infer("Cotton sweater")["warmth"]
    assert infer("Linen shirt")["warmth"] < infer("Flannel shirt")["warmth"]
    assert infer("Satin cami")["formality"] >= infer("Cotton cami")["formality"]


def test_attributes_stay_in_range_however_the_modifiers_stack():
    for title in ("Quilted insulated down wool thermal parka", "Sheer cropped mesh linen tank"):
        got = infer(title)
        assert 1 <= got["formality"] <= 5
        assert 1 <= got["warmth"] <= 5


def test_inference_agrees_with_the_catalog_it_will_be_compared_against():
    """Inferred attributes feed the same engine as seeded ones. If they drift
    apart, the duck contradicts itself between the mock shop (which hands us an
    item) and a real storefront (where we read the title)."""
    off = []
    for item in list(STOREFRONT) + list(CLOSET):
        got = infer(item.title)
        if got is None:
            off.append((item.title, "not recognised"))
            continue
        if (
            abs(got["formality"] - item.formality) > 1
            or abs(got["warmth"] - item.warmth) > 1
            or got["rain_ok"] != item.rain_ok
        ):
            off.append((item.title, got))
    assert not off, f"inference disagrees with the catalog: {off}"


def test_a_scraped_item_reaches_the_same_verdict_as_the_catalog_one():
    """The end that matters: title + price only, no id, no attributes -- and
    the duck must still make the same call it makes on the seeded item."""
    closet, miner, _ = _context()
    now = datetime.now().replace(hour=14, minute=40)
    for item in STOREFRONT:
        scraped = coerce_item(
            {"title": item.title, "price": item.price, **({"size": item.size} if item.size else {})}
        )
        assert scraped is not None, f"could not read {item.title} off a page"
        seeded_call = recommend(item, closet, miner, now)["decision"]
        scraped_call = recommend(scraped, closet, miner, now)["decision"]
        assert seeded_call == scraped_call, (
            f"{item.title}: catalog says {seeded_call}, scraped says {scraped_call}"
        )


def test_a_scraped_item_never_borrows_another_items_history():
    """No id means no id. Attaching one would silently inherit someone else's
    return record, which is the one thing the duck must never get wrong."""
    scraped = coerce_item({"title": "Suede Chelsea Boots", "price": 128.0, "size": "8"})
    assert scraped.id == "unknown"
