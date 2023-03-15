import Router from 'koa-router';
import * as postsCtrl from './posts.ctrl';
import checkLoggedIn from '../../lib/checkLoggedIn';
import multer from '@koa/multer';
import path from 'path';
import serve from 'koa-static';

const posts = new Router();
const upload = multer({
  storage: multer.diskStorage({
    destination: function (req, file, cb) {
      cb(null, 'public/uploads');
    },
    filename: function (req, file, cb) {
      cb(null, new Date().valueOf() + path.extname(file.originalname));
    },
  }),
});

posts.get('/', postsCtrl.list);
posts.post('/', checkLoggedIn, postsCtrl.write);
posts.get('/:id', postsCtrl.getPostById, postsCtrl.read);
posts.delete(
  '/:id',
  checkLoggedIn,
  postsCtrl.getPostById,
  postsCtrl.checkOwnPost,
  postsCtrl.remove,
);
posts.patch(
  '/:id',
  checkLoggedIn,
  postsCtrl.getPostById,
  postsCtrl.checkOwnPost,
  postsCtrl.update,
);
posts.post('/upload', upload.single('img'), postsCtrl.upload);

export default posts;
