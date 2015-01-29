# crate-jsdk
Pure Javascript Development Kit for Crate

## Installing

Install `crate-jsdk` via bower:

    bower install https://github.com/chaudum/crate-jsdk.git

Load `crate.js` and its dependencies (only `reqwest`) in your html file:

```html
<script type="application/javascript" src="/path/to/reqwest.js"></script>
<script type="application/javascript" src="/path/to/crate.js"></script>
```

## Usage

The Crate client requires a single argument which is the host to connect to:

```js
var client = new Client('http://c1.example.com:4200');
```

The client also supports multiple hosts as parameter:

```js
var client = new Client([
    'http://c1.example.com:4200',
    'http://c2.example.com:4200',
    'http://c2.example.com:4200'
  ]);
```

The `execute` method returns a [Javascript Promise](http://www.html5rocks.com/en/tutorials/es6/promises/):

```js
var promise = client.execute('select name from sys.cluster');
promise.then(function(response){
  console.log(response.cols);            // ['name']
  console.log(response.rowcount)         // 1
  console.log(response.rows)             // [['crate']]
  console.log(response.toObjectArray())  // [{'name':'crate'}]
}).catch(function(response){
  console.error(response.error.code);
  console.error(response.error.message);
});
```

### Cluster Health

The SDK also contains a `Cluster` JS class that can be used to determine
the health of tables and the cluster:

```js
var cluster = new Cluster('http://c1.example.com:4200');
cluster.fetch().then(function(cluster){
  console.log(cluster.id);     // 9640b776-5128-4654-94c6-46fd1c6cf194
  console.log(cluster.name);   // jsdk
  console.log(cluster.tables); // [{'full_table_name': '...', 'health_name': 'good', ...}, ...]
  console.log(cluster.health); // {'code: 0, 'name': 'good'}
});
```

## Development

```sh
python2.7 bootstrap.py
bin/buildout -N
bin/bower install
```

To run tests:

```sh
bin/crate
```

Then open file `tests/index.html` in the browser.
