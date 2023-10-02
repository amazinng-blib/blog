const express = require('express');
const cors = require('cors');
const dotenv = require('dotenv');
const { default: mongoose } = require('mongoose');
const UserModel = require('./models/User');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const cookieParser = require('cookie-parser');
const multer = require('multer');
const fs = require('fs');
const PostModel = require('./models/post');

const uploadMiddleware = multer({ dest: 'uploads/' });

dotenv.config();
const app = express();
app.use(cors({ credentials: true, origin: 'http://localhost:3000' }));
app.use(express.json());
app.use(cookieParser());
app.use('/uploads', express.static(__dirname + '/uploads'));

// CONNECT MONGODB

mongoose
  .connect(process.env.MONGODB_URI, {
    useNewUrlParser: true,
    useUnifiedTopology: true,
  })
  .then(() => console.log('connected to db'))
  .catch((error) => {
    console.log({ mess: error?.message });
    process.exit(1);
  });

app.post('/register', async (req, res) => {
  try {
    const { userName, password } = req?.body;
    const userExist = await UserModel.findOne({ userName });
    if (userExist) {
      return res
        .status(400)
        .json({ message: 'User already exist.Please login' });
    }
    const salt = await bcrypt.genSalt();
    const passwordHarsh = await bcrypt.hash(password, salt);

    const newUser = await UserModel.create({
      userName,
      password: passwordHarsh,
    });
    return res.status(200).json({ requestData: newUser, message: 'success' });
  } catch (error) {
    res.status(500).json({ error });
  }
});

// LOGIN

app.post('/login', async (req, res) => {
  try {
    const { userName, password } = req?.body;
    const userDoc = await UserModel.findOne({ userName });
    if (!userDoc) {
      return res.status(400).json({ message: 'Wrong Credentials' });
    }
    const comparePassword = bcrypt.compareSync(password, userDoc?.password);
    if (comparePassword) {
      const token = await jwt.sign(
        { userName, id: userDoc?._id },
        process.env.JWT_SECRET,
        {
          // expiresIn: '30d',
        },
        (err, token) => {
          if (err) throw err;
          return res.cookie('token', token).json({
            id: userDoc?._id,
            userName,
          });
        }
      );
    } else {
      return res.status(400).json({ message: 'Wrong Credentials' });
    }
  } catch (error) {
    res.status(500).json({ error });
    console.log(error);
  }
});

// CHECKING VALID TOKEN

app.get('/profile', async (req, res) => {
  const { token } = req?.cookies;
  try {
    const verify = jwt.verify(
      token,
      process.env.JWT_SECRET,
      {},
      (err, info) => {
        if (err) throw err;
        return res.json(info);
      }
    );
  } catch (error) {
    res.status(500).json({ error });
  }
});

// LOGOUT

app.post('/logout', async (req, res) => {
  try {
    return res.cookie('token', '').json('ok');
  } catch (error) {
    res.status(500).json({ error });
  }
});

// CREATE A POST

app.post('/post', uploadMiddleware.single('image'), async (req, res) => {
  try {
    // GRAB FILE EXTENSION

    const { originalname, path } = req?.file;
    const parts = originalname.split('.');
    const extension = parts[parts?.length - 1];

    //RENAME THE FILE

    const newPath = path + '.' + extension;
    fs.renameSync(path, newPath);

    const { token } = req?.cookies;
    try {
      const verify = jwt.verify(
        token,
        process.env.JWT_SECRET,
        {},
        async (err, info) => {
          if (err) throw err;
          const { title, summary, content } = req?.body;

          const postDocument = await PostModel.create({
            title,
            summary,
            content,
            image: newPath,
            author: info?.id,
          });

          return res.json({ message: 'posted successfully', postDocument });
        }
      );
    } catch (error) {
      return res.status(500).json({ error });
    }
  } catch (error) {
    res.status(500).json({ error });
  }
});

// GET ALL POST

app.get('/post', async (req, res) => {
  try {
    const getAllPost = await PostModel.find({})
      .populate('author', ['userName'])
      .sort({ createdAt: -1 })
      .limit(20);

    if (getAllPost?.length < 0) {
      return res.status(201).json({ message: 'No post available' });
    }

    return res.status(200).json({ getAllPost });
  } catch (error) {
    res.status(500).json({ error });
  }
});

// GET SINGLE POST

app.get('/post/:id', async (req, res) => {
  try {
    const { id } = req?.params;
    const getSinglePost = await PostModel.findOne({ _id: id }).populate(
      'author',
      ['userName']
    );

    if (!getSinglePost) {
      throw new Error();
    }

    return res.status(201).json(getSinglePost);
  } catch (error) {
    res.status(500).json({ error });
  }
});

// UPDATE POST

app.put('/post', uploadMiddleware.single('image'), async (req, res) => {
  let newPath = null;
  try {
    if (req?.file) {
      // GRAB FILE EXTENSION

      const { originalname, path } = req?.file;
      const parts = originalname.split('.');
      const extension = parts[parts?.length - 1];

      //RENAME THE FILE

      newPath = path + '.' + extension;
      fs.renameSync(path, newPath);
    }

    const { token } = req?.cookies;

    // COOKIES

    jwt.verify(token, process.env.JWT_SECRET, {}, async (err, info) => {
      if (err) throw err;

      // QUERY THROW DB WITH THE ID FROM FRONTEND

      const { title, summary, content, id } = req?.body;
      const singlePostDoc = await PostModel.findOne({ _id: id });

      const isAuthor =
        JSON.stringify(singlePostDoc?.author) === JSON.stringify(info?.id);

      if (!isAuthor) {
        return res.status(400).json({
          message: 'You are not Eligible to edit this post. Only the Author',
        });
      }
      const updatedPost = await singlePostDoc.updateOne({
        title,
        summary,
        content,
        image: newPath ? newPath : singlePostDoc?.image,
      });

      return res
        .status(200)
        .json({ message: 'Post successfully updated', updatedPost });
    });

    //COOKIES
  } catch (error) {
    return res.status(500).json({ error });
  }
});

//DELETE A POST ROUTE

app.delete('/post/delete/:id', async (req, res) => {
  const { token } = req?.cookies;

  try {
    jwt.verify(token, process.env.JWT_SECRET, {}, async (err, info) => {
      if (err) throw err;
      //find a post to delete
      const getPostToDelete = await PostModel.findOne({ _id: req?.params?.id });
      if (!getPostToDelete) {
        return res.status(404).json({ message: 'Post not found' });
      }

      await PostModel.deleteOne({ _id: getPostToDelete?.id });
      res.status(200).json({ message: 'Post Deleted successfully' });
    });
  } catch (error) {
    return res.status(500).json({ error });
  }
});

// LIKES
app.put('/post/like/:id', async (req, res) => {
  try {
    const { token } = req?.cookies;
    jwt.verify(token, process.env.JWT_SECRET, {}, async (err, info) => {
      if (err) throw err;

      const { id } = req?.params;
      const post = await PostModel.findOne({ _id: id });

      // CHECK IF THE POST HAS ALREADY BEEN LIKED BY THIS USER

      if (
        post?.likes?.filter(
          (like) => JSON.stringify(like?.user) === JSON.stringify(info?.id)
        ).length > 0
      ) {
        return res
          .status(400)
          .json({ message: "You can't like a post multiple times" });
      }

      post?.likes?.unshift({ user: info?.id });

      await post.save();

      res.status(200).json({
        likes: post?.likes,
        NumLikes: post?.likes?.length,
        message: `user liked a post`,
      });
    });
  } catch (error) {
    console.log(error);
    res.status(500).json({ message: 'Server Error' });
  }
});

// @route    GET /post/comment/
//@desc      Get comment

app.get('/post/likes/:id', async (req, res) => {
  try {
    const { id } = req?.params;
    const post = await PostModel.findOne({ _id: id });
    // console.log({ post: post?.likes?.length });

    return res.status(200).json({ likes: post?.likes?.length });
  } catch (error) {
    console.log(error);
    res.status(500).json({ message: 'Server Error' });
  }
});

// UNLIKE

app.put('/post/unlike/:id', async (req, res) => {
  try {
    const { token } = req?.cookies;
    jwt.verify(token, process.env.JWT_SECRET, {}, async (err, info) => {
      if (err) throw err;

      const { id } = req?.params;
      const post = await PostModel.findOne({ _id: id });

      // CHECK IF THE POST HAS ALREADY BEEN LIKED BY THIS USER

      if (
        post?.likes?.filter((like) => like?.user?.toString() === info?.id)
          .length === 0
      ) {
        return res.status(400).json({ message: 'Post has not yet liked' });
      }

      // GET REMOVE INDEX

      const removeIndex = post?.likes
        ?.map((like) => like?.user?.toString())
        .indexOf(info?.id);

      post.likes.splice(removeIndex, 1);

      await post.save();
      return res
        .status(200)
        .json({ likes: post.likes, message: 'Post Unliked' });
    });
  } catch (error) {
    console.log(error);
    res.status(500).json({ message: 'Server Error' });
  }
});

// COMMENT
app.post('/post/comment/:id', async (req, res) => {
  try {
    const { token } = req.cookies;

    jwt.verify(token, process.env.JWT_SECRET, {}, async (err, info) => {
      if (err) throw err;

      // const user = await UserModel.findOne({ _id: info?.id });
      const post = await PostModel.findOne({ _id: req?.params?.id });

      const newComment = {
        text: req?.body?.text,
        userName: info?.userName,
        user: info?.id,
      };

      if (!req?.body?.text) {
        return res.status(400).json({ message: 'Text is required' });
      }

      post?.comments.unshift(newComment);
      await post.save();
      res.status(200).json({
        comments: post?.comments,
        message: 'Comment posted successfully',
      });
    });
  } catch (error) {
    console.log(error);
    res.status(500).json({ message: 'Server Error' });
  }
});

// @route    GET /post/comment/
//@desc      Get comment
app.get('/post/comments/:id', async (req, res) => {
  try {
    const { id } = req?.params;
    //GET COMMENTS BY POST ID

    const post = await PostModel.findOne({ _id: id });

    res
      .status(200)
      .json({ comments: post?.comments, commentCount: post?.comments?.length });
  } catch (error) {
    console.log(error);
    res.status(500).json({ message: 'Server Error' });
  }
});

// @route    DELETE /post/comment/:id/:comment_id
//@desc      Delete comment
//@access    Private

app.delete('/post/:id/:comment_id', async (req, res) => {
  try {
    const { token } = req.cookies;
    jwt.verify(token, process.env.JWT_SECRET, {}, async (err, info) => {
      if (err) throw err;
      const post = await PostModel.findOne({ _id: req?.params?.id });

      // PULL OUT COMMENT

      const commentExist = post?.comments?.find(
        (comment) => comment?.id === req?.params?.comment_id
      );

      //MAKE SURE COMMENT EXIST

      if (!commentExist) {
        return res.status(404).json({ message: 'Comment does not exist' });
      }

      //Check user that made the comment

      if (commentExist?.user?.toString() !== info?.id) {
        return res.status(401).json({ message: 'User Not authorized' });
      }

      // GET REMOVE INDEX

      const removeIndex = post?.comments
        ?.map((comment) => comment?._id?.toString())
        .indexOf(commentExist?.id);

      post.comments.splice(removeIndex, 1);

      await post.save();

      return res.status(200).json({
        comments: post.comments,
        message: 'Comment deleted successfully',
      });
    });
  } catch (error) {
    console.log(error);
    res.status(500).json({ message: 'Server Error' });
  }
});

app.listen(4000, () => {
  console.log('App listening on port : 4000');
});
