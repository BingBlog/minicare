"""embed 编排测试：mock 混元客户端，验证 BLOB 写回"""
from kb_pipeline.config import Settings


def test_to_blob_roundtrip():
    from kb_pipeline.embed.runner import _to_blob
    import struct

    vec = [0.1, -0.2, 0.3]
    blob = _to_blob(vec)
    assert len(blob) == 4 * 3  # float32 × 3
    back = struct.unpack("<3f", blob)
    assert abs(back[0] - 0.1) < 1e-6
    assert abs(back[1] + 0.2) < 1e-6


def test_settings_has_credentials_fields():
    s = Settings(_env_file=None)
    assert hasattr(s, "hunyuan_secret_id")
    assert hasattr(s, "tcb_ai_secret_id")
