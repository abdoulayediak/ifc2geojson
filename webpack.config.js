const path = require('path');

module.exports = {
  entry: './src/ifc2geojson.ts',
  output: {
    filename: 'ifc2geojson.min.js',
    path: path.resolve(__dirname, 'dist/browser'),
    library: {
      name: 'ifc2geojson',
      type: 'umd',
    },
    globalObject: 'this',
  },
  module: {
    rules: [
      {
        test: /\.ts$/,
        use: 'ts-loader',
        exclude: /node_modules/,
      }
    ]
  },
  resolve: {
    extensions: ['.ts', '.js'],
  },
  mode: 'production'
};
