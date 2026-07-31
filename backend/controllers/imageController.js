const multer = require("multer");
const {
  MAX_IMAGE_BYTES, createImage, getImage, deleteImage
} = require("../services/imageService");

// Same memoryStorage + error-wrapping pattern customerAccountController and
// menuController already use. The limit is multer's own first line of
// defence so an oversized body is rejected before it is ever base64'd; the
// service re-checks the real byte length rather than trusting this.
const imageUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: MAX_IMAGE_BYTES }
});

const uploadImageFile = (req, res, next) => {
  imageUpload.single("file")(req, res, (error) => {
    if (error) {
      if (error instanceof multer.MulterError) {
        error.statusCode = 400;
        if (error.code === "LIMIT_FILE_SIZE") {
          error.message = "That image is too large — pick one under 512KB.";
        }
        // multer's own code would otherwise be echoed to the client as an
        // app-level error code and read like one.
        delete error.code;
      }
      return next(error);
    }
    next();
  });
};

const uploadImageController = async (req, res, next) => {
  try {
    if (!req.file) {
      const error = new Error("An image file is required.");
      error.statusCode = 400;
      throw error;
    }
    // req.file.mimetype is deliberately NOT passed on — the service decides
    // the type from the bytes. See utils/imageBytes.js.
    const result = await createImage({
      organizationId: req.user.organizationId,
      ownerType: req.body.ownerType,
      buffer: req.file.buffer
    });
    res.status(201).json({ success: true, ...result, url: `/api/images/${result.id}` });
  } catch (error) {
    next(error);
  }
};

const deleteImageController = async (req, res, next) => {
  try {
    const removed = await deleteImage({
      id: req.params.id,
      organizationId: req.user.organizationId
    });
    if (!removed) {
      const error = new Error("Image not found.");
      error.statusCode = 404;
      throw error;
    }
    res.status(200).json({ success: true });
  } catch (error) {
    next(error);
  }
};

// Served unauthenticated on purpose: this is an <img src>, and an image tag
// cannot carry an Authorization header. Everything reachable here is already
// public-facing content — outlet logos, banners, reward and event photos, all
// of which are served today to unauthenticated visitors of the public tenant
// page. There is no endpoint that enumerates ids.
const getImageController = async (req, res, next) => {
  try {
    // Shape-checked here rather than left to the driver: a malformed id
    // reaches a real mongoose as a CastError and surfaces as a 500, which
    // this endpoint would hit constantly from stale or hand-edited URLs.
    // Regex, not mongoose.isValidObjectId — the mock DB replaces the whole
    // mongoose module in dev/test.
    if (!/^[a-f\d]{24}$/i.test(req.params.id || "")) {
      const error = new Error("Image not found.");
      error.statusCode = 404;
      throw error;
    }
    const image = await getImage(req.params.id);
    if (!image) {
      const error = new Error("Image not found.");
      error.statusCode = 404;
      throw error;
    }
    // Immutable is safe without a version parameter because rows are never
    // updated in place — replacing an image mints a new id.
    res.set("Cache-Control", "public, max-age=31536000, immutable");
    // The stored type was sniffed from the bytes, but nosniff is what stops a
    // browser second-guessing it and rendering the response as something else
    // entirely. Belt and braces on an endpoint that serves user-supplied
    // bytes back verbatim.
    res.set("X-Content-Type-Options", "nosniff");
    res.set("Content-Type", image.mimeType);
    res.send(image.buffer);
  } catch (error) {
    next(error);
  }
};

module.exports = {
  uploadImageFile,
  uploadImage: uploadImageController,
  deleteImage: deleteImageController,
  getImage: getImageController
};
