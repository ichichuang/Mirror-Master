MAX_UPLOAD_BYTES = 20 * 1024 * 1024
MAX_DECODED_PIXELS = 25_000_000
MAX_BACKGROUND_REMOVAL_DECODED_PIXELS = 12_000_000
MAX_BACKGROUND_REMOVAL_CONCURRENCY = 1
MAX_CONTRACT_BYTES = 64 * 1024
UPLOAD_READ_CHUNK_BYTES = 64 * 1024

CAPABILITIES_CONTRACT_VERSION = "1.0"
BACKGROUND_REMOVAL_CONTRACT_VERSION = "1.0"
PROJECT_SCHEMA_VERSIONS = ("1.0",)
SUPPORTED_IMAGE_MIME_TYPES = ("image/png", "image/jpeg", "image/webp")

MIN_PATTERN_ROWS = 1
MAX_PATTERN_ROWS = 300
MIN_PATTERN_COLUMNS = 1
MAX_PATTERN_COLUMNS = 300

MIN_BEAD_DIAMETER_MM = 1.0
MAX_BEAD_DIAMETER_MM = 10.0
MIN_BEAD_PITCH_MM = 1.0
MAX_BEAD_PITCH_MM = 12.0

MIN_BOARD_ROWS = 1
MAX_BOARD_ROWS = 300
MIN_BOARD_COLUMNS = 1
MAX_BOARD_COLUMNS = 300
FIXED_BOARD_PRESETS = {
    "smallSquare": (14, 14),
    "standardSquare": (29, 29),
}

PATTERN_MODES = ("photo", "pixelArt", "existingChart")
SAMPLING_MODES = ("average", "nearest")
DITHERING_MODES = ("none", "floydSteinberg")
EXPORT_FORMATS = ("png", "pdf", "csv", "projectJson")
PNG_TEMPLATES = ("pure", "annotated", "numbered", "rounded")
GRID_MIRROR_AXES = ("horizontal", "vertical")
MAX_PDF_PAGES = 500
MAX_PDF_RASTER_PIXELS = 1_100_000_000
PDF_PRODUCTION_CONTRACT = {
    "pageSize": "A4",
    "summaryPage": True,
    "onePagePerBoard": True,
    "coordinates": True,
    "legends": True,
    "counts": True,
    "physicalScale": "fit-with-declared-scale",
    "maximumPages": MAX_PDF_PAGES,
    "maximumRasterPixels": MAX_PDF_RASTER_PIXELS,
}
