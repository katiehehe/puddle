"""Avoided spending derived from recorded actions, never from recommendations."""
from . import storage


def state():
    return storage.pond()
