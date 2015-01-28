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

;(function(Q, Client, Cluster, Query){

  if (!String.prototype.trim) {
    String.prototype.trim = function(){
      return this.replace(/^\s+|\s+$/g,'');
    };
  }
  var default_host = '127.0.0.1:4200';
  var hosts = [
      'https://st1.p.fir.io:4200',
      'https://st2.p.fir.io:4200'
  ];

  Q.test("round robin", function(assert) {
    var cr = Client.connect(hosts);
    assert.equal(cr._active_hosts, hosts);
    assert.equal(cr.getNextHost(), hosts[0]);
    assert.equal(cr.getNextHost(), hosts[1]);
    assert.equal(cr.getNextHost(), hosts[0]);
  });

  Q.test("no servers", function(assert) {
    var cr = Client.connect(hosts);
    cr._active_hosts = [];
    assert.equal(cr.getNextHost(), null);
  });

  Q.test("empty server list", function(assert) {
    assert.throws(function(){
      var cr = Client.connect([]);
    }, Client.NO_MORE_SERVERS, Client.NO_MORE_SERVERS.message);
  });

  Q.test("undefined server list", function(assert) {
    var cr = Client.connect();
    assert.equal(cr._active_hosts, default_host);
  });

  Q.test("class instantiation", function(assert) {
    var cr = new Client();
    assert.equal(cr._active_hosts, default_host);
    cr = new Client(hosts);
    assert.equal(cr._active_hosts, hosts);
  });

  Q.test("query instance", function(assert) {
    var q = new Query();
    assert.equal(q.sql, '/_sql');
    assert.equal(q.host, default_host);
    assert.equal(q.getURI(), 'http://127.0.0.1:4200/_sql');
  });

  Q.test("query execute", function(assert){
    var done = assert.async();
    var q = new Query('127.0.0.1:44200');
    q.execute('select name from sys.cluster;')
    .then(function(res){
      assert.equal(res.rowcount, 1);
      assert.equal(res.rows[0][0], "jsdk");
      done();
    });
  });

  Q.test("client execute success", function(assert){
    var done = assert.async();
    var cr = new Client(['127.0.0.1:44200']);
    var stmt = 'select name from sys.cluster';
    cr.execute(stmt)
    .then(function(res){
      assert.equal(res.rowcount, 1);
      assert.equal(res.rows[0][0], "jsdk");
      assert.equal(res.request.stmt, stmt);
      done();
    });
  });

  Q.test("client execute failed", function(assert){
    var done = assert.async();
    var cr = new Client(['127.0.0.1:44200']);
    var stmt = 'select from sys.cluster';
    cr.execute(stmt)
    .catch(function(res){
      assert.equal(res.error.code, 4000);
      assert.equal(res.error.message, "SQLActionException[line 1:8: no viable alternative at input 'from']");
      assert.equal(res.request.stmt, stmt);
      done();
    });
  });

  Q.test("client execute args", function(assert){
    var done = assert.async();
    var cr = new Client(['127.0.0.1:44200']);
    cr.execute('drop table foo');
    cr.execute('create table foo (name string, value integer) clustered into 3 shards with (number_of_replicas=\'0-all\')')
    .then(function(res){
      cr.execute('insert into foo (name, value) values (?, ?)',
                 ['foo', 1])
      .then(function(res){
        assert.equal(res.rowcount, 1);
        cr.execute('drop table foo').then(done);
      });
    });
  });

  Q.test("client execute bulk args", function(assert){
    var done = assert.async();
    var cr = new Client(['127.0.0.1:44200']);
    cr.execute('drop table foo');
    cr.execute('create table foo (name string, value integer) clustered into 3 shards with (number_of_replicas=\'0-all\')')
    .then(function(res){
      cr.execute('insert into foo (name, value) values (?, ?)',
                 null, [['foo', 1], ['bar', 2], ['foobar', 3]])
      .then(function(res){
        assert.equal(res.results.length, 3);
        cr.execute('drop table foo').then(done);
      });
    });
  });

  Q.test("cluster health - waring/underreplication", function(assert){
    var done = assert.async();
    var h = ['127.0.0.1:44200'];
    var cr = new Client(h);
    cr.execute('drop table foo');
    cr.execute('create table foo (name string, value integer) ' +
               'clustered into 10 shards ' +
               'with (number_of_replicas=1)')
    .then(function(res){
      cr.execute('insert into foo (name, value) values (?, ?)',
                 null, [['foo', 1], ['bar', 2], ['foobar', 3]])
      .then(function(res){
        cr.execute('refresh table foo')
        .then(function(){
          var cluster = new Cluster(h);
          assert.equal(cluster.health.code, -1);
          assert.equal(cluster.health.name, 'unknown');

          cluster.fetch().then(function(cl){
            var foo = cluster.tables[0];
            assert.equal(cluster.health.code, 1);
            assert.equal(cluster.health.name, 'warning');
            assert.equal(foo.full_table_name, 'doc.foo');
            assert.equal(foo.health, 1);
            assert.equal(foo.records_total, 3);
            assert.equal(foo.shards_configured, 10);
            assert.equal(foo.replicas_configured, "1");
            assert.equal(foo.shards_started, 10);
            assert.equal(foo.shards_underreplicated, 10);
            cr.execute('drop table foo').then(done);
          });

        }).catch(console.error);

      });
    });
  });

}(QUnit, Client, Cluster, Query));

