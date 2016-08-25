/* Copyright 2016 Streampunk Media Ltd.

  Licensed under the Apache License, Version 2.0 (the "License");
  you may not use this file except in compliance with the License.
  You may obtain a copy of the License at

    http://www.apache.org/licenses/LICENSE-2.0

  Unless required by applicable law or agreed to in writing, software
  distributed under the License is distributed on an "AS IS" BASIS,
  WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
  See the License for the specific language governing permissions and
  limitations under the License.
*/

var redioactive = require('../../../util/Redioactive.js');
var util = require('util');
var express = require('express');
var bodyParser = require('body-parser');
var http = require('http');
var https = require('https');
var fs = require('fs');
var Grain = require('../../../model/Grain.js');

function extractVersions(v) {
  var m = v.match(/^([0-9]+):([0-9]+)$/)
  return [+m[1], +m[2]];
}

function compareVersions(l, r) {
  var lm = extractVersions(l);
  var rm = extractVersions(r);
  if (lm[0] < rm[0]) return -1;
  if (lm[0] > rm[0]) return 1;
  if (lm[1] < rm[1]) return -1;
  if (lm[1] > rm[1]) return 1;
  return 0;
}

const mimeMatch = /^\s*(\w+)\/(\w+)/;
const paramMatch = /\b(\w+)=(\S+)\b/g;

module.exports = function (RED) {
  function SpmHTTPIn (config) {
    RED.nodes.createNode(this, config);
    redioactive.Funnel.call(this, config);

    if (!this.context().global.get('updated'))
      return this.log('Waiting for global context to be updated.');

    var protocol = (config.protocol === 'HTTP') ? http : https;
    var node = this;
    var total = 0;
    config.pullUrl = (config.pullUrl.endsWith('/')) ?
      config.pullUrl.slice(-1) : config.pullUrl;
    config.path = (config.path.endsWith('/')) ?
      config.path.slice(-1) : config.path;
    var clientID = Date.now();
    this.baseTime = [ Date.now() / 1000|0, (Date.now() % 1000) * 1000000 ];
    var nodeAPI = this.context().global.get('nodeAPI');
    var ledger = this.context().global.get('ledger');
    var nodeAPI = this.context().global.get('nodeAPI');
    var localName = config.name || `${config.type}-${config.id}`;
    var localDescription = config.description || `${config.type}-${config.id}`;
    var pipelinesID = config.device ?
      RED.nodes.getNode(config.device).nmos_id :
      this.context().global.get('pipelinesID');
    var sourceID = uuid.v4();
    var flowID = uuid.v4();
    var flow = null; var source = null; var recvr = null;
    var tags = {};

    function makeFlowAndSource (headers) {
      var contentType = headers['content-type'];
      var mime = contentType.match(mimeMatch);
      tags = { format : [ mime[1] ], encodingName : [ mime[2] ] };
      var parameters = contentType.match(paramMatch);
      parameters.forEach(function (p) {
         var splitP = p.split('=');
         if (splitP[0] === 'rate') splitP[0] = 'clockRate';
         tags[splitP[0]] = [ splitP[1] ];
      });
      if (headers['x-arachnid-fourcc']) {
        tags.packing = [ headers['x-arachnid-fourcc'] ];
      } else if (tags.encodingName[0] === 'raw') {
        tags.clockRate = [ '90000' ];
        tags.packing = [ 'pgroup' ];
      }
      source = new ledger.Source(null, null, localName, localDescription,
        "urn:x-nmos:format:" + tags.format[0], null, null, pipelinesID, null);
      flow = new ledger.Flow(null, null, localName, localDescription,
        "urn:x-nmos:format:" + tags.format[0], this.tags, source.id, null);
      recvr = new ledger.Receiver(null, null, localName, localDescription,
        "urn:x-nmos:format:" + tags.format[0], null, tags,
        pipelinesID, ledger.transports.dash, null);
      nodeAPI.putResource(source)
      .then(function () {
        return nodeAPI.putResource(flow);
      }).then(function () {
        return nodeAPI.putResource(recvr);
      }).catch(function (err) {
        node.error(`Unable to register resource : ${err}`);
      });
    };

    var runNext = function (x, push, next) {
      var req = protocol.get(
          `${config.pullUrl}/${config.path}/${nextRequest[x]}`,
          function (res) {
        var count = 0;
        var position = 0;
        if (res.statusCode === 200) {
          var grainData = new Buffer(+res.headers['content-length']);
          nextRequest[x] = res.headers['arachnid-ptporigin'];
          if (!flow) makeFlowAndSource(headers);
          res.on('data', function (data) {
            data.copy(grainData, position);
            position += data.length;
            count++;
          });
          res.on('end', function () {
            grainData = grainData.slice(0, position);
            nextRequest[x] = res.headers['arachnid-nextbythread'];
            var ptpOrigin = res.headers['arachnid-ptporigin'];
            var ptpSync = res.headers['arachnid-ptpsync'];
            var duration = res.headers['arachnid-grainduration'];
            var gFlowID = (config.regenerate) ? flowID : res.headers['arachnid-flowid'];
            var gSourceID = (config.regenerate) ? sourceID : res.headers['arachnid-sourceid'];
            var tc = res.headers['arachnid-timecode'];
            var g = new Grain([ grainData ], ptpSync, ptpOrigin, tc, gFlowID,
              gSourceID, duration); // regenerate time as emitted
            pushGrains(g, push);
            next();
          });
        };
        res.on('error', function (e) {
          node.warn(`Received error during streaming of get response on thread ${x}: ${e}.`);
          push(`Received error during streaming of get response on thread ${x}: ${e}.`);
          activeThreads[x] = false;
          next();
        });
      });
      req.on('error', function (e) {
        node.warn(`Received error when requesting frame from server on thread ${x}: ${e}`);
        push(`Received error when requesting frame from server on thread ${x}: ${e}`);
        activeThreads[x] = false;
        next();
      });
      req.setHeader('Arachnid-ThreadNumber', x);
      req.setHeader('Arachnid-TotalConcurrent', config.parallel);
      req.setHeader('Arachnid-ClientID', clientID);
    };

    var grainQueue = { };
    var highWaterMark = '0:0';
    // Push every grain older than what is in nextRequest, send grains in order
    function pushGrains(g, push) {
      grainQueue[g.formatTimestamp(g.ptpOrigin)] = g;
      var nextMin = nextRequest.reduce(function (a, b) {
        return compareVersions(a, b) <= 0 ? a : b;
      });
      Object.keys(grainQueue).filter(function (gts) {
        return compareVersions(gts, nextMin) <= 0;
      })
      .sort(compareVersions)
      .forEach(function (gts) {
        delete grainQueue[gts];
        if (!config.regenerate) {
          push(null, grainQueue[gts]);
        } else {
          var g = grainQueue[gts];
          var grainTime = new Buffer(10);
          grainTime.writeUIntBE(this.baseTime[0], 0, 6);
          grainTime.writeUInt32BE(this.baseTime[1], 6);
          var grainDuration = g.getDuration();
          this.baseTime[1] = ( this.baseTime[1] +
            grainDuration[0] * 1000000000 / grainDuration[1]|0 );
          this.baseTime = [ this.baseTime[0] + this.baseTime[1] / 1000000000|0,
            this.baseTime[1] % 1000000000];
          push(null, new Grain(g.buffers, grainTime, g.ptpOrigin, g.timecode,
            flow.id, source.id, g.duration));
        };
        highWaterMark = gts;
      });
    };

    var activeThreads =
      [ false, false, false, false, false, false].slice(0, config.parallel);
    var nextRequest =
      [ '-5', '-4', '-3', '-2', '-1', '0' ].slice(-config.parallel);

    if (config.mode === 'push') { // TODO push mode
      // var app = express();
      // app.use(bodyParser.raw({ limit : config.payloadLimit || 6000000 }));
      //
      // app.post(config.path, function (req, res) {
      //   console.log(pushCount++, process.hrtime(star
      //     tTime), req.body.length);
      //   res.json({ length : req.body.length }); // Need to add back pressure concept
      // });
      //
      // var server = protocol.createServer((config.protocol === 'HTTP') ? {} : {
      //   key : fs.readFileSync('./certs/dynamorse-key.pem'),
      //   cert : fs.readFileSync('./certs/dynamorse-cert.pem')
      // }, app).listen(config.port);
      // server.on('listening', function () {
      //   this.log(`Dynamorse ${config.protocol} server listening on port ${config.port}.`);
      // });
    } else { // config.mode is set to pull
      this.generator(function (push, next) {
        for ( var i = 0 ; i < activeThreads.length ; i++ ) {
          if (!activeThreads[i]) {
            runNext.call(this, i, push, next);
            activeThreads[i] = true;
          };
        };
      });
    }

  }
  util.inherits(SpmHTTPIn, redioactive.Funnel);
  RED.nodes.registerType("spm-http-in", SpmHTTPIn);
}
