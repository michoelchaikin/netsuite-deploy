const gulp = require('gulp');
const gulpUtil = require('gulp-util');
const merge = require('merge-stream');
const changed = require('gulp-changed');
const filenames = require('gulp-filenames');
const runSequence = require('run-sequence');
const typescript = require('gulp-typescript');
const del = require('del');
const keepass = require('keepass-http-client');
const open = require('open');
const uploadToNetsuite = require('netsuite-deploy');
const netsuiteSettings = require('./package.json').netsuite;

gulp.task('build', () => {
  const scriptDest = `dist/FileCabinet/${netsuiteSettings.folder}/`;

  filenames.forget('all');

  return merge(
    gulp
      .src(['src/deploy.xml', 'src/manifest.xml'])
      .pipe(changed('dist/'))
      .pipe(gulp.dest('dist/'))
      .pipe(filenames('objects')),
    gulp
      .src('src/objects/*.xml')
      .pipe(changed('dist/Objects'))
      .pipe(gulp.dest('dist/Objects'))
      .pipe(filenames('objects')),
    gulp
      .src('src/assets/**/*')
      .pipe(changed(scriptDest + '/assets/'))
      .pipe(gulp.dest(scriptDest + '/assets/'))
      .pipe(filenames('files')),
    gulp
      .src('src/scripts/**/*.js')
      .pipe(changed(scriptDest))
      .pipe(
        typescript({
          target: 'ES5',
          allowJs: true,
          // alwaysStrict: true,
        })
      )
      .pipe(gulp.dest(scriptDest))
      .pipe(filenames('files'))
  );
});

gulp.task('clean', () => {
  return del('dist/');
});

gulp.task('build-clean', cb => runSequence('clean', 'build', cb));

let credentials;

gulp.task('load-credentials', cb => {
  if (credentials) {
    cb();
  }

  return keepass.itl({ url: 'sdf.netsuite.com' }).then(results => {
    if (results['Entries'] && results['Entries'].length) {
      let result = results['Entries'][0];
      credentials = {
        email: result.Login,
        password: result.Password,
        role: result.StringFields['role'],
        account: result.StringFields['account'],
      };
    } else {
      throw new Error('Unable to retrieve credentials');
    }
  });
});

function deploy(environment) {
  // Even if there are no results, will still be an empty 'all'
  if (Object.keys(filenames.get('all')).length === 1) {
    gulpUtil.log(gulpUtil.colors.red('No files to deploy!'));
    return;
  }

  let config = filenames.get('objects').length
    ? Object.assign(credentials, { environment, method: 'sdf', file: 'dist\\' })
    : Object.assign(credentials, {
        environment,
        method: 'suitetalk',
        file: filenames.get('files', 'full'),
        path: netsuiteSettings.folder,
        base: `${__dirname}/dist/FileCabinet/${netsuiteSettings.folder}/`,
      });

  return uploadToNetsuite(config);
}

gulp.task('deploy-sandbox', ['build', 'load-credentials'], () => {
  return deploy('sandbox');
});

gulp.task('deploy-production', ['build-clean', 'load-credentials'], () => {
  return deploy('production');
});

gulp.task('deploy-reload', ['deploy-sandbox'], () => {
  const url = netsuiteSettings.testurl;
  gulpUtil.log(
    'Opening',
    gulpUtil.colors.red(url),
    'in',
    gulpUtil.colors.green('firefox')
  );
  open(url, 'firefox');
});

gulp.doneCallback = err => {
  process.exit(err ? 1 : 0);
};
