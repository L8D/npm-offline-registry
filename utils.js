var path = require('path');
var fs = require('fs');
var config = require( __dirname + '/./config' );
var Promise = require('bluebird');
var _exec = Promise.promisify( require('child_process').exec );

var REGISTRY_NAME = config.REGISTRY_NAME;
var LOCAL_REGISTRY = config.LOCAL_REGISTRY;


function exec( cmd, envVars ){
  return _exec( cmd, { env: envVars });
}
exports.exec = exec;

function fileExists( fname ){
  return new Promise( function( resolve ){
    fs.exists( fname, function(exists){
      resolve( exists );
    });
  });
}
exports.fileExists = fileExists;

var readFile = Promise.promisify( fs.readFile );
exports.readFile = readFile;


exports.patchData = function ( data ){
  Object.keys(data.versions).forEach( function( v ){
    var val = data.versions[v];
    var protocal = 'http://';
    if( val.dist.tarball.indexOf( 'https:' ) !== false ){
      protocal = 'https://';
    }
    val.dist.tarball = val.dist.tarball.replace( protocal + REGISTRY_NAME, LOCAL_REGISTRY );
  });
};

var fetchAndCacheMetadataCmd =[
  'mkdir -p $packageCacheDir',
  'wget -nv "http://$REGISTRY_NAME/$packageNameEncoded" -O $cacheFile || { wgetExitStatus=$? && rm $cacheFile; exit $wgetExitStatus ; }'
].join( ';' );

var  fetchAndCacheTarballCmd = [
  'mkdir -p $packageTarballDir',
  'wget -nv $tarballUrl -O $tarballPath || { wgetExitStatus=$? && rm $tarballPath; exit $wgetExitStatus ; }',
  'cd $packageTarballDir; tar -xzf package.tgz package/package.json',
].join( ';' );

exports.fetchAndCacheMetadata = function ( packageName, cacheFile ){
  var packageCacheDir = path.dirname( cacheFile );
  //handle slash in scoped package name but do not convert @
  var packageNameEncoded = encodeURIComponent(packageName).replace(/^%40/, '@');

  return exec( fetchAndCacheMetadataCmd, {
    packageCacheDir: packageCacheDir,
    REGISTRY_NAME: REGISTRY_NAME,
    packageNameEncoded: packageNameEncoded,
    cacheFile: cacheFile,
  });
};

exports.fetchAndCacheTarball = function ( packageName, version, tarballPath ){
  //handle slash in scoped package name but do not convert @
  var packageNameEncoded = encodeURIComponent(packageName).replace(/^%40/, '@');
  
  var tarballUrl = 'http://' + REGISTRY_NAME + '/' + packageNameEncoded + '/-/' + packageNameEncoded + '-' + version + '.tgz';
  var packageTarballDir = path.dirname( tarballPath );

  return exec( fetchAndCacheTarballCmd, {
    packageTarballDir: packageTarballDir,
    tarballUrl: tarballUrl,
    tarballPath: tarballPath,
  });
};




