var path = require('path');
var fs = require('fs');
var config = require( __dirname + '/./config' );
var Promise = require('bluebird');
var RegClient = require('npm-registry-client');
var client = new RegClient();
var mkdirp = require('mkdirp');
var _exec = Promise.promisify( require('child_process').exec );

var REGISTRY_NAME = config.REGISTRY_NAME;
var LOCAL_REGISTRY = config.LOCAL_REGISTRY;
var NPM_PATH = config.NPM_PATH;


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
  /* Get the list of versions which is available in local cache */
  var cacheJsonFile, cacheJsonFileData = [];

  if( config.STRICT ){
      cacheJsonFile = path.join( NPM_PATH, data.name );
      cacheJsonFileData = fs.existsSync( cacheJsonFile ) ? fs.readdirSync( cacheJsonFile ) : [];
  }

  Object.keys(data.versions).forEach( function( v ){
    var val = data.versions[v];


    if( cacheJsonFileData.length && config.STRICT ){
      /* Suppose our cache.json is at latest revision. It contains lot of versions which is not available in local cache.
      Then, Remove the versions which is not in local cache from the list. Otherwise npm will always choose higher versions whcih is not available in our cache */
      if( cacheJsonFileData.indexOf(v) == -1 ){
        delete data.versions[v];
        return;
      }
    }

    var protocal = 'http://';
    if( val.dist.tarball.indexOf( 'https:' ) !== false ){
      protocal = 'https://';
    }
    val.dist.tarball = val.dist.tarball.replace( protocal + REGISTRY_NAME, LOCAL_REGISTRY );
  });
};

var fetchAndCacheMetadataCmd =[
  'mkdir -p $packageCacheDir',
  'wget -nv --header="Authorization: Bearer b0b4e0e9-4b31-41ba-b7b8-f7a089b8550f" "http://$REGISTRY_NAME/$packageName" -O $cacheFile || { wgetExitStatus=$? && rm $cacheFile; exit $wgetExitStatus ; }'
].join( ';' );

var  fetchAndCacheTarballCmd = [
  'mkdir -p $packageTarballDir',
  'wget -nv $tarballUrl -O $tarballPath || { wgetExitStatus=$? && rm $tarballPath; exit $wgetExitStatus ; }',
  'cd $packageTarballDir; tar -xzf package.tgz package/package.json',
].join( ';' );


function encodePackageName( packageName ){
  //handle slash in scoped package name but do not convert @
  return encodeURIComponent(packageName).replace(/^%40/, '@');
}

exports.fetchAndCacheMetadata = function ( packageName, cacheFile ){
  var packageCacheDir = path.dirname( cacheFile );
  packageName = encodePackageName( packageName );

  return new Promise(function (resolve, reject) {
    client.get('https://' + REGISTRY_NAME + '/' + packageName, {
      auth: {token: process.env.NPM_TOKEN},
      alwaysAuth: true
    }, function (error, data, raw, res) {
      if (error) return reject(error);

      resolve({
        data: data,
        raw: raw
      });
    });
  }).then(function (result) {
    return Promise.fromCallback(function (cb) {
      mkdirp(packageCacheDir, cb);
    }).then(function () {
      return Promise.fromCallback(function (cb) {
        fs.writeFile(cacheFile, result.raw, cb);
      });
    }).then(function () {
      return result.data;
    });
  });
};

exports.fetchAndCacheTarball = function ( packageId, packageName, version, tarballPath ){
  packageId = encodePackageName( packageId ).replace(/%2F/, '/');
  packageName = encodePackageName( packageName );

  var tarballUrl = 'https://' + REGISTRY_NAME + '/' + packageId + '/-/' + packageName + '-' + version + '.tgz';
  var packageTarballDir = path.dirname( tarballPath );

  return Promise.fromCallback(function (cb) {
    mkdirp(packageTarballDir, cb);
  }).then(function () {
    return new Promise(function (resolve, reject) {
      client.fetch(tarballUrl, {
        streaming: true,
        auth: {
          token: process.env.NPM_TOKEN,
          alwaysAuth: true
        }
      }, function (error, res) {
        if (error) return reject(error);

        var stream = res.pipe(fs.createWriteStream(tarballPath));
        stream.on('close', resolve);
        stream.on('error', reject);
      });
    });
  });
};




