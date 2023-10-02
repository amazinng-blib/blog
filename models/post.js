const mongoose = require('mongoose');
const { Schema } = mongoose;

const PostSchema = new Schema(
  {
    title: String,
    summary: String,
    content: String,
    image: String,
    author: { type: Schema.Types.ObjectId, ref: 'User' },
    likes: [
      {
        user: { type: Schema.Types.ObjectId, ref: 'User' },
      },
    ],
    comments: [
      {
        user: { type: Schema.Types.ObjectId, ref: 'User' },
        text: {
          type: String,
          required: true,
        },
        userName: String,
        date: {
          type: Date,
          default: Date.now(),
        },
      },
    ],
  },
  {
    timestamps: true,
  }
);

const PostModel = mongoose.model('Post', PostSchema);

module.exports = PostModel;
