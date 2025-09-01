import mongoose from "mongoose";
import bcrypt from "bcrypt";

const userSchema = new mongoose.Schema(
  {
    email: {
      type: String,
      required: true,
      unique: true,
      lowercase: true,
      trim: true,
    },
    password: {
      type: String,
      required: function () { return !this.provider; },
      minlength: 6,
    },
    name: {
      type: String,
      required: false,
      trim: true,
    },
    avatar: {
      type: String,
      required: false
    },
    provider: {
      type: String, // 'google' | 'github' | 'discord' | 'huggingface'
      required: false,
      index: true
    },
    providerId: {
      type: String,
      required: false,
      index: true
    }
  },
  { timestamps: true }
);

userSchema.pre("save", async function (next) {
  if (!this.password || !this.isModified("password")) return next();
  const salt = await bcrypt.genSalt(10);
  this.password = await bcrypt.hash(this.password, salt);
  next();
});

userSchema.methods.comparePassword = async function (candidatePassword) {
  return bcrypt.compare(candidatePassword, this.password);
};

export default mongoose.models.user || mongoose.model("user", userSchema);


