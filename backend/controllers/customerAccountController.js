const multer = require("multer");
const {
  registerAccount, loginAccount, authenticateWithGoogle,
  verifyAccountEmail, resendVerification, forgotPassword, resetPassword,
  completeProfile, enterTenant, getMyTenants,
  setAvatar, removeAvatar, getAvatar, MAX_AVATAR_BYTES
} = require("../services/customerAccountService");

const register = async (req, res, next) => {
  try {
    const { name, email, password, phone, pendingClaimId, claimSecret } = req.body;
    const result = await registerAccount({ name, email, password, phone, pendingClaimId, claimSecret });
    res.status(201).json(result);
  } catch (error) {
    next(error);
  }
};

const login = async (req, res, next) => {
  try {
    const { email, password } = req.body;
    const result = await loginAccount({ email, password });
    res.status(200).json(result);
  } catch (error) {
    next(error);
  }
};

const googleAuth = async (req, res, next) => {
  try {
    const { idToken } = req.body;
    const result = await authenticateWithGoogle({ idToken });
    res.status(200).json(result);
  } catch (error) {
    next(error);
  }
};

const verifyEmailController = async (req, res, next) => {
  try {
    const result = await verifyAccountEmail({ token: req.query.token });
    res.status(200).json(result);
  } catch (error) {
    next(error);
  }
};

const resendVerificationController = async (req, res, next) => {
  try {
    const result = await resendVerification({ email: req.body.email });
    res.status(200).json(result);
  } catch (error) {
    next(error);
  }
};

const forgotPasswordController = async (req, res, next) => {
  try {
    const result = await forgotPassword({ email: req.body.email });
    res.status(200).json(result);
  } catch (error) {
    next(error);
  }
};

const resetPasswordController = async (req, res, next) => {
  try {
    const result = await resetPassword({ token: req.body.token, password: req.body.password });
    res.status(200).json(result);
  } catch (error) {
    next(error);
  }
};

const completeProfileController = async (req, res, next) => {
  try {
    const result = await completeProfile({
      customerAccountId: req.customerAccount.id,
      phone: req.body.phone
    });
    res.status(200).json(result);
  } catch (error) {
    next(error);
  }
};

const enterTenantController = async (req, res, next) => {
  try {
    const result = await enterTenant({
      customerAccountId: req.customerAccount.id,
      organizationId: req.organizationId
    });
    res.status(200).json(result);
  } catch (error) {
    next(error);
  }
};

const getMyTenantsController = async (req, res, next) => {
  try {
    const result = await getMyTenants({ customerAccountId: req.customerAccount.id });
    res.status(200).json(result);
  } catch (error) {
    next(error);
  }
};

// Same memoryStorage + error-wrapping pattern menuController already uses for
// the spreadsheet import. The limit is multer's own first line of defence so
// an oversized body is rejected before it is ever base64'd; the service
// re-checks the real byte length rather than trusting this.
const avatarUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: MAX_AVATAR_BYTES }
});

const uploadAvatarFile = (req, res, next) => {
  avatarUpload.single("file")(req, res, (error) => {
    if (error) {
      if (error instanceof multer.MulterError) {
        error.statusCode = 400;
        if (error.code === "LIMIT_FILE_SIZE") {
          error.message = "That image is too large — pick one under 256KB.";
        }
        // multer's own `code` (LIMIT_FILE_SIZE) would otherwise be echoed to
        // the client as an app-level error code and read like one.
        delete error.code;
      }
      return next(error);
    }
    next();
  });
};

const uploadAvatarController = async (req, res, next) => {
  try {
    if (!req.file) {
      const error = new Error("An image file is required.");
      error.statusCode = 400;
      throw error;
    }
    const result = await setAvatar({
      customerAccountId: req.customerAccount.id,
      buffer: req.file.buffer,
      mimeType: req.file.mimetype
    });
    res.status(200).json(result);
  } catch (error) {
    next(error);
  }
};

const deleteAvatarController = async (req, res, next) => {
  try {
    const result = await removeAvatar({ customerAccountId: req.customerAccount.id });
    res.status(200).json(result);
  } catch (error) {
    next(error);
  }
};

// Served unauthenticated on purpose: this is an <img src>, and an image tag
// cannot carry an Authorization header. What it exposes is a picture the
// customer chose to show, addressed by an ObjectId that is never listed
// anywhere — the same posture every avatar CDN takes. Nothing else about the
// account is reachable here, and there is no endpoint that enumerates ids.
const getAvatarController = async (req, res, next) => {
  try {
    // Shape-checked here rather than left to the driver: a malformed id
    // reaches a real mongoose as a CastError and surfaces as a 500, which
    // this endpoint would hit constantly from stale or hand-edited URLs.
    // Regex, not mongoose.isValidObjectId — the mock DB replaces the whole
    // mongoose module in dev/test.
    if (!/^[a-f\d]{24}$/i.test(req.params.accountId || "")) {
      const error = new Error("No profile picture.");
      error.statusCode = 404;
      throw error;
    }
    const avatar = await getAvatar(req.params.accountId);
    if (!avatar) {
      const error = new Error("No profile picture.");
      error.statusCode = 404;
      throw error;
    }
    // Immutable is safe because the client always requests ?v=<avatarVersion>
    // and that number changes on every upload AND every removal.
    res.set("Cache-Control", "public, max-age=31536000, immutable");
    res.set("Content-Type", avatar.mimeType);
    res.send(avatar.buffer);
  } catch (error) {
    next(error);
  }
};

module.exports = {
  register,
  login,
  googleAuth,
  uploadAvatarFile,
  uploadAvatar: uploadAvatarController,
  deleteAvatar: deleteAvatarController,
  getAvatar: getAvatarController,
  verifyEmail: verifyEmailController,
  resendVerification: resendVerificationController,
  forgotPassword: forgotPasswordController,
  resetPassword: resetPasswordController,
  completeProfile: completeProfileController,
  enterTenant: enterTenantController,
  getMyTenants: getMyTenantsController
};
