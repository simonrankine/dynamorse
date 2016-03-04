/* Copyright 2016 Christine S. MacNeill

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

// Ready for some scriptorian magic :-)

var redioactive = require('../../../util/Redioactive.js');
var util = require('util');

module.exports = function (RED) {
  function Decoder (config) {
    RED.nodes.createNode(this, config);
    redioactive.Valve.call(this, config);
    this.consume(function (err, x, push, next) {

    });
    this.on('close', this.close);
  }
  util.inherits(Decoder, redioactive.Valve);
  RED.nodes.registerType("decoder", Decoder);
}