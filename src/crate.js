/**
 * crate-jsdk
 * A pure Javascript Development Kit for Crate
 *
 * Copyright 2015 Crate.IO
 * Apache License v2.0
 *
 * https://crate.io
 * https://github.com/chaudum/crate-jsdk
 *
 */

;(function(){

  var DEFAULT_HOST = '127.0.0.1:4200';

  var Client,
      Query,
      SQLResponse,
      Cluster;

  var win = window,
      doc = document,
      $ = reqwest,
      __arg = function __arg(val, def) { return (typeof val === 'undefined') ? def : val; };

  /**
   * Most elegant way to clone a JavaScript object
   * http://stackoverflow.com/questions/728360/most-elegant-way-to-clone-a-javascript-object
   */
  var clone = function clone(obj) {
    var copy;
    // Handle the 3 simple types, and null or undefined
    if (null == obj || "object" != typeof obj) return obj;
    // Handle Date
    if (obj instanceof Date) {
      copy = new Date();
      copy.setTime(obj.getTime());
      return copy;
    }
    // Handle Array
    if (obj instanceof Array) {
      copy = [];
      for (var i = 0, len = obj.length; i < len; i++) {
        copy[i] = clone(obj[i]);
      }
      return copy;
    }
    // Handle Object
    if (obj instanceof Object) {
      copy = {};
      for (var attr in obj) {
        if (obj.hasOwnProperty(attr)) copy[attr] = clone(obj[attr]);
      }
      return copy;
    }
    throw new Error("Unable to copy obj! Its type isn't supported.");
  }


  /**
   * Crate Client
   */

  Client = function(hosts){
    if (hosts && hosts.length === 0) throw Client.NO_MORE_SERVERS;
    if (typeof hosts === 'string') hosts = [hosts]
    this._active_hosts = __arg(hosts, DEFAULT_HOST);
    this._inactive_hosts = [];
    this._hostIdx = 0;
  };

  Client.NO_MORE_SERVERS = new Error('No more hosts available.');

  Client.prototype.execute = function execute(stmt, args, bulk){
    var host = this.getNextHost();
    if (!host) throw Client.NO_MORE_SERVERS;
    var q = new Query(host);
    return q.execute(stmt, args, bulk);
  };

  Client.prototype.getNextHost = function getNextHost(){
    var h = null;
    if (this._hostIdx >= this._active_hosts.length &&
	this._active_hosts.length > 0) {
      this._hostIdx = 0;
    }
    h = this._active_hosts[this._hostIdx];
    this._hostIdx++;
    return h;
  };

  Client.connect = function connect(hosts){
    return new Client(hosts);
  };


  /**
   * Crate Cluster
   */

  Cluster = function(hosts){
    this.client = new Client(hosts);
    this._cluster = null;
    this._tables = [];
    this._shards = [];
  };

  Cluster.prototype.fetch = function fetch(){
    var self = this;
    var c = this.client;
    c.execute('select id, name, master_node, settings from sys.cluster')
    .then(function(data){
      self._cluster = data.toObjectArray()[0];
      self.applyInfo();
    });

    c.execute('select table_name, number_of_shards as shards_configured, number_of_replicas as replicas_configured, schema_name, partitioned_by ' +
              'from information_schema.tables ' +
              'where schema_name not in (\'information_schema\', \'sys\') ' +
              'order by schema_name, table_name')
    .then(function(data){
      self._tables = data.toObjectArray();
      self.update();
    });

    c.execute('select table_name, schema_name, sum(num_docs) as sum_docs, "primary", avg(num_docs) as avg_docs, count(*) as count, state, sum(size) as doc_size ' +
          'from sys.shards ' +
          'group by table_name, schema_name, "primary", state ' +
          'order by schema_name, table_name, "primary", state')
    .then(function(data){
      self._shards = data.toObjectArray();
      self.update();
    });

  };

  Cluster.prototype.update = function update(){
    var t = this._tables,
        s = this._shards;
    if (t.length && s.length && t.length == s.length) {
      this.tables = [];
      for (var i=0; i<t.length; i++) {
        var table = t[i];
        table['full_table_name'] = table.schema_name + '.' + table.table_name;
        var shards = s.filter(function(shard, idx) {
          return shard.table_name === table.table_name &&
                 shard.schema_name === table.schema_name;
        });
        var ti = new TableInfo(shards, table.shards_configured, table.partitioned_by);
        var info = ti.asObject();
        for (var k in table) {
          info[k] = table[k];
        }
        this.tables.push(info);
      }
      console.log(this.tables);
    }
  };

  Cluster.prototype.applyInfo = function applyInfo(){
    for (var key in this._cluster) {
      this[key] = this._cluster[key];
    }
  };

  /**
   * Table Information
   */

  var TableInfo = function TableInfo(shards, shardsConfigured, partitionedBy) {
    this.shards = shards;
    this.shardsConfigured = shardsConfigured || 0;
    this.partitionedBy = partitionedBy || [];
    this.partitioned = this.partitionedBy.length > 0;

    this.primaryShards = function primaryShards() {
      return this.shards.filter(function(shard, idx) {
               return shard.primary;
             });
    };
    this.size = function size() {
      var primary = this.primaryShards();
      return primary.reduce(function(memo, shard, idx) {
               return memo + shard.doc_size;
             }, 0);
    };
    this.totalRecords = function totalRecords() {
      var primary = this.primaryShards();
      return primary.reduce(function (memo, shard, idx) {
               return memo + shard.sum_docs;
             }, 0);
    };
    this.missingShards = function missingShards() {
      if (this.partitioned && this.startedShards() === 0) return 0;
      var activePrimaryShards = this.shards.filter(function(shard) {
                                  return shard.state in {'STARTED':'', 'RELOCATING':''} && shard.primary === true;
                                });
      var numActivePrimaryShards = activePrimaryShards.reduce(function(memo, shard, idx) {
                                     return shard.count + memo;
                                   }, 0);
      return Math.max(this.shardsConfigured-numActivePrimaryShards, 0);
    };
    this.underreplicatedShards = function underreplicatedShards() {
      return this.shards.filter(function(obj, idx){
               var active = obj.state in {'STARTED':'', 'RELOCATING':''};
               return !active && obj.primary === false;
             }).reduce(function(memo, obj, idx){
               return obj.count + memo;
             }, 0);
    };
    this.unassignedShards = function unassignedShards() {
      var shards = this.shards.filter(function(shard, idx) {
                     return shard.state == 'UNASSIGNED';
                   });
      return shards.reduce(function(memo, shard, idx) { return shard.count + memo; }, 0);
    };
    this.startedShards = function startedShards() {
      var shards = this.shards.filter(function(shard, idx) {
                     return shard.state == 'STARTED';
                   });
      return shards.reduce(function(memo, shard, idx) {return shard.count + memo; }, 0);
    };
    this.underreplicatedRecords = function underreplicatedRecords() {
      var primary = this.primaryShards();
      return primary.length ? Math.ceil(primary[0].avg_docs * this.underreplicatedShards()) : 0;
    };
    this.unavailableRecords = function unavailableRecords() {
      var started = this.shards.filter(function(shard, idx) {
                      return shard.state == 'STARTED';
                    });
      return started.length ? Math.ceil(started[0].avg_docs * this.missingShards()) : 0;
    };
    this.health = function health() {
      if (this.partitioned && this.startedShards() === 0) return 0;
      if (this.primaryShards().length === 0 || this.missingShards() > 0) return 2;
      if (this.unassignedShards() > 0 || this.underreplicatedShards()) return 1;
      return 0;
    };
    this.healthName = function healthName(code) {
      var names = ['good', 'warning', 'critical'];
      return names[code];
    };
    this.asObject = function asObject() {
      var h = this.health();
      var o = {};
      o.shards_configured = this.shardsConfigured;
      o.health = h;
      o.health_name = this.healthName(h);
      o.shards_started = this.startedShards();
      o.shards_missing = this.missingShards();
      o.shards_underreplicated = this.underreplicatedShards();
      o.records_total = this.totalRecords();
      o.records_unavailable = this.unavailableRecords();
      o.records_underreplicated = this.underreplicatedRecords();
      o.size = this.size();
      o.partitioned = this.partitioned;
      o.partitioned_by = this.partitionedBy;
      return o;
    };
  };


  /**
   * SQL Response
   */

  SQLResponse = function(data){
    for (var key in data) {
      this[key] = data[key];
    }
  };

  SQLResponse.prototype.toObjectArray = function toObjectArray(){
    if (!this.rows || this.rows.length === 0) return [];
    var self = this;
    var rows = clone(this.rows);
    return rows.map(function(obj, idx){
      return self._object(obj);
    });
  };

  SQLResponse.prototype._object = function(row) {
    if (this.cols.length != row.length) return {};
    var obj = {};
    for (var i = 0; i < this.cols.length; i++) {
      obj[this.cols[i]] = row[i];
    }
    return obj;
  };

  /**
   * SQL Query
   */

  Query = function(host){
    this._sql = '/_sql';
    this._host = __arg(host, DEFAULT_HOST);
    this.rows = [];
    this.cols = [];
    this.rowcount = -1;
  };

  Query.prototype.getURI = function getURI(){
    var h = this._host + this._sql;
    if (!h.match('^http')) {
      h = 'http://' + h;
    }
    return h;
  };

  Query.prototype.execute = function(stmt, a, b){
    var args = __arg(a, []);
    var bulk = __arg(b, []);
    var body = {
      'stmt': stmt.replace(/;+$/, ''),
      'args': args,
      'bulk_args': bulk
    };
    var options = {
      'url': this.getURI(),
      'method': 'post',
      'type': 'json',
      'contentType': 'application/json',
      'headers': {
        'Accept': 'application/json'
      },
      'data': JSON.stringify(body)
    };
    return new Promise(function(resolve, reject){
      $(options).always(function(data){
	data.stmt = stmt;
	data.args = args;
	data.bulk_args = bulk;
	data.options = options;
	resolve(new SQLResponse(data));
      });
    });
  };

  win.Client = Client;
  win.Query = Query;
  win.Cluster = Cluster;

}());
