import mongoose from 'mongoose';

const HEX_COLOR_REGEX = /^#([0-9a-fA-F]{6})$/;

const CollectionSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: [true, 'userId is required for collection ownership'],
      index: true,
    },
    name: {
      type: String,
      required: [true, 'Collection name is required'],
      trim: true,
      minlength: [1, 'Collection name must be at least 1 character'],
      maxlength: [60, 'Collection name cannot exceed 60 characters'],
    },
    description: {
      type: String,
      trim: true,
      maxlength: [300, 'Description cannot exceed 300 characters'],
      default: '',
    },
    color: {
      type: String,
      required: [true, 'Collection color is required'],
      trim: true,
      default: '#6366f1',
      validate: {
        validator: (v) => HEX_COLOR_REGEX.test(v),
        message: (props) => `"${props.value}" is not a valid 6-character hex color code (e.g. #6366f1).`,
      },
    },
  },
  {
    timestamps: true,
    toJSON: {
      virtuals: true,
      transform: (doc, ret) => {
        ret.id = ret._id.toString();
        delete ret._id;
        delete ret.__v;
        return ret;
      },
    },
  }
);

// Compound index with case-insensitive collation for user-scoped unique collection names
CollectionSchema.index(
  { userId: 1, name: 1 },
  { unique: true, collation: { locale: 'en', strength: 2 } }
);

CollectionSchema.index({
  userId: 1,
  createdAt: -1,
});

export const Collection = mongoose.model('Collection', CollectionSchema);
export default Collection;
