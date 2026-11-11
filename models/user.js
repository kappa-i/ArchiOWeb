import mongoose from 'mongoose';

const Schema = mongoose.Schema;

// Un utilisateur (password contient le hash bcrypt, jamais le mot de passe)
const userSchema = new Schema(
  {
    username: {
      type: String,
      required: true,
      unique: true,
      trim: true,
      minlength: 3,
      maxlength: 20,
    },
    email: {
      type: String,
      required: true,
      unique: true,
      trim: true,
      lowercase: true,
      validate: {
        validator: isValidEmail,
        message: 'Invalid email',
      },
    },
    password: {
      type: String,
      required: true,
    },
  },
  { timestamps: true },
);

userSchema.set('toJSON', {
  transform: transformJsonUser,
});

// Vérifie qu'un e-mail a la forme nom@domaine.ext
function isValidEmail(email) {
  if (email.includes(' ')) {
    return false;
  }

  const parts = email.split('@');
  if (parts.length !== 2) {
    return false;
  }

  const name = parts[0];
  const domain = parts[1];

  if (name.length === 0) {
    return false;
  }

  return domain.includes('.');
}

// Réponse JSON : id au lieu de _id, et jamais le mot de passe
function transformJsonUser(doc, json) {
  json.id = json._id;
  delete json._id;
  delete json.__v;
  delete json.password;
  return json;
}

export default mongoose.model('User', userSchema);
