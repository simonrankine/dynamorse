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

var H = require('highland');
var redioactive = require('../../../util/Redioactive.js');
var uuid = require('uuid');
var Grain = require('../../../model/Grain.js');
var naudiodon = require('naudiodon');
var util = require('util');

function swapBytes(x, bitsPerSample) {
  switch (bitsPerSample) {
    case 24:
      var tmp = 0|0;
      for ( var y = 0|0 ; y < x.length ; y += 3|0 ) {
        tmp = x[y];
        x[y] = x[y + 2];
        x[y + 2] = tmp;
      }
      break;
    case 16:
      var tmp = 0|0;
      for ( var y = 0|0 ; y < x.length ; y += 2|0 ) {
        tmp = x[y];
        x[y] = x[y + 1];
        x[y + 1] = tmp;
      }
      break;
    default: // No swap
      break;
  }
  return x;
}

module.exports = function(RED){
  function AUDIOIn(config){
    RED.nodes.createNode(this,config);
    redioactive.Funnel.call(this,config);
    if(!this.context().global.get('updated'))
      return this.log('Waiting for global context to be updated');
    var node = this;
    this.baseTime = [ Date.now() / 1000|0, (Date.now() % 1000) * 1000000 ];
    this.blockAlign = 4;
    this.sampleRate = 44100;
    this.channelCount = 2;
    this.bytePerSample = 2;
    var nodeAPI = this.context().global.get('nodeAPI');
    var ledger = this.context().global.get('ledger');
    var localName = config.name || `${config.type}-${config.id}`;
    var localDescription = config.description || `${config.type}-${config.id}`;
    var pipelinesID = config.device ?
  	RED.nodes.getNode(config.device).nmos_id :
  	this.context().global.get('pipelinesID');
    var source = new ledger.Source(null, null, localName, localDescription,
  				   "urn:x-nmos:format:audio", null, null, pipelinesID, null);
    var flowID = uuid.v4();
    nodeAPI.putResource(source).then(function(){
      var pr = new naudiodon.AudioReader({
  	channelCount :this.channelCount,
  	sampleFormat: naudiodon.SampleFormat16Bit,
  	sampleRate: this.sampleRate,
      });

      pr.once('audio_ready',function(pa){
	if(flow == null){
	  var tags = {
            format : [ 'audio' ],
            channels : [ `${this.channelCount}` ],
            clockRate : [ `${this.sampleRate}` ],
            encodingName : [ `L${this.bytePerSample*8}` ],
            blockAlign : [ `${this.bytePerSample*this.channelCount}` ]
          };
	  var flow = new ledger.Flow(flowID, null, localName, localDescription,
				     "urn:x-nmos:format:audio", tags, source.id, null);
          nodeAPI.putResource(flow).catch(node.warn);
	}
	this.log("audio ready");
  	this.highland(H(pr).map(
	  function(b){
	    return swapBytes(b,this.bytePerSample*8);
	  }.bind(this)
	).map(
	  function (b) {
	    this.log("grain");
            var grainTime = new Buffer(10);
            grainTime.writeUIntBE(this.baseTime[0], 0, 6);
            grainTime.writeUInt32BE(this.baseTime[1], 6);
	    this.blockAlign = this.channelCount * this.bytePerSample;
            var grainDuration = [ b.length / this.blockAlign|0, this.sampleRate ];
            this.baseTime[1] = ( this.baseTime[1] +
				 grainDuration[0] * 1000000000 / grainDuration[1]|0 );
            this.baseTime = [ this.baseTime[0] + this.baseTime[1] / 1000000000|0,
			      this.baseTime[1] % 1000000000];
            return new Grain([b], grainTime, grainTime, null,
	    flowID, source.id, grainDuration);
          }.bind(this)
	))
	pr.pa.inputStart();
      }.bind(this));
    }.bind(this));
  }
  util.inherits(AUDIOIn,redioactive.Funnel);
  RED.nodes.registerType("audio-in",AUDIOIn);
}
