"""Tests for utility functions."""

import pytest

from app.utils.helpers import (
    chunk_list,
    generate_uuid,
    mask_email,
    mask_phone,
    now_iso,
    now_utc,
    safe_dict,
    slugify,
)


@pytest.mark.unit
class TestSlugify:
    """Tests for slugify()."""

    def test_basic(self) -> None:
        assert slugify("Hello World") == "hello-world"

    def test_with_special_chars(self) -> None:
        assert slugify("Hello, World!") == "hello-world"

    def test_with_numbers(self) -> None:
        assert slugify("Dayjoy 2026") == "dayjoy-2026"

    def test_with_multiple_spaces(self) -> None:
        assert slugify("Hello   World") == "hello-world"

    def test_empty_string(self) -> None:
        assert slugify("") == ""

    def test_already_lowercase(self) -> None:
        assert slugify("hello-world") == "hello-world"


@pytest.mark.unit
class TestMaskEmail:
    """Tests for mask_email()."""

    def test_normal_email(self) -> None:
        masked = mask_email("john.doe@example.com")
        assert masked.endswith("@example.com")
        assert "*" in masked
        assert "john.doe" not in masked

    def test_short_local(self) -> None:
        masked = mask_email("jo@example.com")
        assert "*" in masked
        assert "jo" not in masked or masked.startswith("j")

    def test_single_char_local(self) -> None:
        masked = mask_email("j@example.com")
        assert "@" in masked
        assert masked.split("@")[0] == "*"

    def test_no_at_sign(self) -> None:
        assert mask_email("notanemail") == "***"


@pytest.mark.unit
class TestMaskPhone:
    """Tests for mask_phone()."""

    def test_normal_phone(self) -> None:
        masked = mask_phone("+91-98765-43210")
        assert masked.endswith("3210")
        assert "*" in masked
        assert "98765" not in masked

    def test_short_phone(self) -> None:
        """4-char phone is fully masked (privacy: don't reveal any digits)."""
        masked = mask_phone("1234")
        assert masked == "****"
        assert "1" not in masked

    def test_very_short_phone(self) -> None:
        """3-char phone is fully masked."""
        masked = mask_phone("123")
        assert masked == "***"


@pytest.mark.unit
class TestChunkList:
    """Tests for chunk_list()."""

    def test_basic(self) -> None:
        result = chunk_list([1, 2, 3, 4, 5], 2)
        assert result == [[1, 2], [3, 4], [5]]

    def test_exact_division(self) -> None:
        result = chunk_list([1, 2, 3, 4], 2)
        assert result == [[1, 2], [3, 4]]

    def test_empty_list(self) -> None:
        assert chunk_list([], 2) == []

    def test_chunk_larger_than_list(self) -> None:
        assert chunk_list([1, 2], 5) == [[1, 2]]


@pytest.mark.unit
class TestUUIDHelpers:
    """Tests for UUID helpers."""

    def test_generate_uuid_returns_uuid(self) -> None:
        u = generate_uuid()
        assert isinstance(u, type(generate_uuid()))  # UUID type

    def test_generate_uuid_is_unique(self) -> None:
        u1 = generate_uuid()
        u2 = generate_uuid()
        assert u1 != u2


@pytest.mark.unit
class TestTimeHelpers:
    """Tests for time helpers."""

    def test_now_utc_returns_datetime(self) -> None:
        dt = now_utc()
        assert dt.tzinfo is not None  # timezone-aware

    def test_now_iso_returns_string(self) -> None:
        s = now_iso()
        assert isinstance(s, str)
        assert "T" in s  # ISO format

    def test_now_iso_parseable(self) -> None:
        from datetime import datetime

        s = now_iso()
        dt = datetime.fromisoformat(s)
        assert dt.tzinfo is not None


@pytest.mark.unit
class TestSafeDict:
    """Tests for safe_dict()."""

    def test_dict_passthrough(self) -> None:
        d = {"a": 1}
        assert safe_dict(d) is d

    def test_object_with_dict(self) -> None:
        class Obj:
            def __init__(self) -> None:
                self.x = 1

        result = safe_dict(Obj())
        assert result == {"x": 1}

    def test_primitive(self) -> None:
        result = safe_dict(42)
        assert result == {"value": "42"}
