var express = require('express');
var Promise = require('bluebird');
var config = require( __dirname + '/./config' );
var utils = require( __dirname + '/./utils');

var NPM_PATH = config.NPM_PATH;
var REGISTRY_NAME = config.REGISTRY_NAME;
var ENABLE_NPM_FAILOVER = config.ENABLE_NPM_FAILOVER;


var fetchAndCacheMetadata = utils.fetchAndCacheMetadata;
var fetchAndCacheTarball = utils.fetchAndCacheTarball;
var patchData = utils.patchData;
var fileExists = utils.fileExists;
var readFile = utils.readFile;

var app = express();
app.use( function(req, res, next ){
  res._log = {
    method: req.method,
    path: req.path,
    cacheHit: 'Hit',
    cacheFile: '',
  };

  res.on( 'finish', function(){
    var log = this._log;
    console.log( log.cacheHit, this.statusCode, log.method, log.path, '    =>   ', log.cacheFile  );
  });
  // setTimeout( next, 1000 );
  next();
});

app.use( function(req, res, next) {
  console.log('---', '???', req.method, req.path);
  next();
});

function getPackage (packageName, req, res, next) {
  var cacheFile = [ NPM_PATH, REGISTRY_NAME, packageName, '.cache.json' ].join( '/' );

  return fileExists( cacheFile )
    .tap( function( isExists ){
      if( !isExists ){
        if ( !ENABLE_NPM_FAILOVER ) {
          res._log.cacheHit = '!!!';
          return Promise.reject( { status: 404 });
        }
        res._log.cacheHit = '---';
        return fetchAndCacheMetadata( packageName, cacheFile );
      }
    })
    .then( function( ){
      res._log.cacheFile = cacheFile;
      return readFile( cacheFile, 'utf-8' );
    })
    .then( function( cachedData ){
      cachedData = JSON.parse( cachedData );
      patchData( cachedData );
      return res.send( cachedData );
    })
    .catch( next );
}

app.get( '/:package', function( req, res, next ){
  var package = req.params.package;

  return getPackage(package, req, res, next);
});

app.get( '/@:repo/:package', function( req, res, next ){
  var repo = req.params.repo;
  var package = req.params.package;

  return getPackage('@' + repo + '/' + package, req, res, next);
});

app.get( '/:package/-/:tarball', function( req, res, next ){
  var packageId = req.params.package;
  var packageName = decodeURIComponent(packageId).match(/\/?(.+)$/)[1];
  var version = req.params.tarball.match( /-(\d.*).tgz$/ )[1];

  return getTarball(packageId, packageName, version, req, res, next);
});

app.get( '/@:repo/:package/-/:tarball', function( req, res, next ){
  var repo = req.params.repo;
  var package = req.params.package;
  var version = req.params.tarball.match( /-(\d.*).tgz$/ )[1];

  return getTarball('@' + repo + '/' + package, package, version, req, res, next);
});

function getTarball (packageId, packageName, version, req, res, next) {
  var packagePath = [ NPM_PATH , packageId, version, 'package.tgz'].join( '/' );

  fileExists( packagePath )
    .tap( function( isExists ){
      if( !isExists ){
        if ( !ENABLE_NPM_FAILOVER ) {
          res._log.cacheHit = '!!!';
          return Promise.reject( { status: 404 });
        }
        res._log.cacheHit = '---';
        console.log('pre-fetch', packagePath);
        return fetchAndCacheTarball( packageId, packageName, version, packagePath );
      }
    })
    .then( function( ){
      console.log('post-fetch', packagePath);
      res._log.cacheFile = packagePath;
      return res.sendFile( packagePath );
    })
    .catch( next );
}


// catch 404 and forward to error handler
app.use(function(req, res, next) {
  next({ status: 404 });
});

// error handlers

app.use(function(err, req, res, next) {
  var message = err.message || err;
  err.stack && console.log( err.stack );
  res.status(err.status || 500);
  // NPM registry returns empty objects for unknown packages
  if( err.status == 404 ){
    message = {};
  }
  res.send( message );
  if( next ) { next(); }
});



module.exports = app;
