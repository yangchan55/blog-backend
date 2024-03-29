import Post from '../../models/post';
import mongoose from 'mongoose';
import Joi from 'joi';
import sanitizeHtml from 'sanitize-html';
import sharp from 'sharp';
import fs from 'fs';

const { ObjectId } = mongoose.Types;

const sanitizeOption = {
  allowedTags: [
    'h1',
    'h2',
    'b',
    'i',
    'u',
    's',
    'p',
    'ul',
    'ol',
    'li',
    'blockquote',
    'a',
    'img',
    'pre',
    'span',
  ],
  allowedAttributes: {
    a: ['href', 'name', 'target'],
    img: ['src'],
    li: ['class'],
    pre: ['class', 'spellcheck'],
    span: ['class'],
  },
  allowedSchemes: ['data', 'http'],
};

export const getPostById = async (ctx, next) => {
  const { id } = ctx.params;
  if (!ObjectId.isValid(id)) {
    ctx.status = 400;
    return;
  }
  try {
    const post = await Post.findById(id);
    if (!post) {
      ctx.status = 404;
      return;
    }
    ctx.state.post = post;
    return next();
  } catch (e) {
    ctx.throw(e);
  }
};

export const checkOwnPost = (ctx, next) => {
  const { user, post } = ctx.state;
  if (post.user._id.toString() !== user._id) {
    ctx.status = 403;
    return;
  }
  return next();
};

// POST 데이터 저장
export const write = async (ctx) => {
  // 파라미터 검증 (타입, 필수값 설정)
  const schema = Joi.object().keys({
    title: Joi.string().required(),
    body: Joi.string().required(),
    tags: Joi.array().items(Joi.string()).required(),
  });

  const result = schema.validate(ctx.request.body);
  if (result.error) {
    ctx.status = 400;
    ctx.body = result.error;
    return;
  }

  const { title, body, tags } = ctx.request.body;

  const post = new Post({
    title,
    body: sanitizeHtml(body, sanitizeOption),
    image: parseImageToBody(body),
    tags,
    count: 0,
    user: ctx.state.user,
  });
  try {
    await post.save();
    ctx.body = post;
  } catch (e) {
    ctx.throw(500, e);
  }
};

const removeHtmlAndShorten = (body) => {
  const filtered = sanitizeHtml(body, {
    allowedTags: ['p'],
  });
  return filtered.length < 100 ? filtered : `${filtered.slice(0, 100)}...`;
};

const parseImageToBody = (body) => {
  const imgArr = ['img1.jpg', 'img2.jpg', 'img3.jpg', 'img4.jpg', 'img5.jpg'];
  const imgSrc =
    'http://localhost:4000/' +
    imgArr[Math.floor(Math.random() * imgArr.length)];

  let image = '<img src="' + imgSrc + '"/>';

  const imgReg = /<img[^>]*src=[^>]*>/g;
  const isImage = imgReg.exec(body);

  if (isImage !== null) {
    image = isImage[0];
  }

  return image;
};

// GET 데이터 리스트 조회
export const list = async (ctx) => {
  const page = parseInt(ctx.query.page || '1', 10);
  if (page < 1) {
    ctx.status = 400;
    return;
  }
  const { tag, username } = ctx.query;
  // tag, username 값이 유효하면 객체에 넣고 아니면 넣지 않음
  // 값이 없을 경우 undefined가 들어가기 때문에 없을 경우 초기화
  const query = {
    ...(username ? { 'user.username': username } : {}),
    ...(tag ? { tags: tag } : {}),
  };
  try {
    const posts = await Post.find(query)
      .sort({ _id: -1 })
      .limit(20)
      .skip((page - 1) * 20)
      .lean()
      .exec();
    // 토탈 페이지 카운트를 헤더에 보낸다.
    const postCount = await Post.countDocuments(query).exec();
    ctx.set('Last-Page', Math.ceil(postCount / 20));
    // body의 길이가 200자 이상일 경우 ...처리
    ctx.body = posts.map((post) => ({
      ...post,
      body: removeHtmlAndShorten(post.body),
    }));
  } catch (e) {
    ctx.throw(500, e);
  }
};

// GET 특정 데이터 조회
export const read = async (ctx) => {
  const nextData = ctx.state.post;

  if (nextData.count === undefined) {
    nextData.count = 0;
  }

  if (nextData.count >= 0) {
    nextData.count = nextData.count + 1;
  }

  try {
    const post = await Post.findByIdAndUpdate(nextData._id, nextData, {
      new: true,
    }).exec();
    ctx.body = post;
  } catch (e) {
    ctx.throw(500, e);
  }
};

// DELETE 특정 데이터 삭제
export const remove = async (ctx) => {
  const { id } = ctx.params;
  try {
    const post = await Post.findByIdAndRemove(id).exec();
    ctx.status = 204;
  } catch (e) {
    ctx.throw(500, e);
  }
};

// PATCH 특정 데이터 수정
export const update = async (ctx) => {
  const { id } = ctx.params;
  // 파라미터 검증 (타입 설정)
  const schema = Joi.object().keys({
    title: Joi.string(),
    body: Joi.string(),
    tags: Joi.array().items(Joi.string()),
  });

  const result = schema.validate(ctx.request.body);
  if (result.error) {
    ctx.status = 400;
    ctx.body = result.error;
    return;
  }

  const nextData = { ...ctx.request.body };
  nextData.image = parseImageToBody(nextData.body);

  if (nextData.body) {
    nextData.body = sanitizeHtml(nextData.body, sanitizeOption);
  }

  try {
    const post = await Post.findByIdAndUpdate(id, nextData, {
      new: true,
    }).exec();
    if (!post) {
      ctx.status = 404;
      return;
    }
    ctx.body = post;
  } catch (e) {
    ctx.throw(500, e);
  }
};

// 파일 업로드
export const upload = async (ctx) => {
  try {
    sharp(ctx.request.file.path)
      .resize({ width: 600 })
      .withMetadata()
      .toBuffer((err, buffer) => {
        if (err) throw err;
        fs.writeFile(ctx.request.file.path, buffer, (err) => {
          if (err) throw err;
        });
      });
    ctx.body = {
      filename: ctx.request.file.filename,
    };
  } catch (e) {
    ctx.throw(500, e);
  }
};
