const fs = require("fs");
const {resolve} = require("path");

const webpack = require("webpack");
const HtmlWebpackPlugin = require("html-webpack-plugin");
const ReactRefreshWebpackPlugin = require("@pmmmwh/react-refresh-webpack-plugin");
const FaviconsWebpackPlugin = require("favicons-webpack-plugin");
const HardSourceWebpackPlugin = require("hard-source-webpack-plugin");
const CopyPlugin = require("copy-webpack-plugin");

const packageJSON = JSON.parse(fs.readFileSync("./package.json"));

module.exports = (_, {mode = "development"}) => {
  console.log("Running in mode:", mode);
  return {
    mode,
    entry: ["normalize.css", "typeface-raleway", "./src/index.jsx"],
    resolve: {
      extensions: [".wasm", ".mjs", ".js", ".json", ".jsx"]
    },
    module: {
      rules: [
        {
          test: /\.jsx?$/,
          exclude: /node_modules/,
          use: [
            {
              loader: "babel-loader",
              options: {
                envName: mode
              }
            },
          ],
        },
        {
          test: /\.css$/i,
          use: ["style-loader", "css-loader"],
        },
        {
          test: /\.(gif|png|jpe?g)$/i,
          use: [{
            loader: "responsive-loader",
            options: {
              adapter: require("responsive-loader/sharp")
            }
          }],
        },

        // Fonts
        {
          test: /\.(woff(2)?|ttf|eot|svg)(\?v=\d+\.\d+\.\d+)?$/i,
          use: [
            {
              loader: "file-loader",
              options: {
                name: "[name].[ext]",
                outputPath: "fonts/"
              }
            }
          ]
        }
      ],
    },
    optimization: {
      splitChunks: {
        chunks: "all"
      }
    },
    output: {
      path: resolve(__dirname, "./public"),
      filename: "[name]-[hash].bundle.js",
      chunkFilename: "[name]-[contenthash].chunk.js",
    },
    devServer: {
      hot: true,
      liveReload: false,
      historyApiFallback: true,
      publicPath: "/",
      host: "0.0.0.0",
      https: true
    },
    devtool: mode === "development" ? "eval-cheap-module-source-map" : false,
    plugins: [
      new CopyPlugin({
        patterns: [
          {
            from: "../metricsMap.json"
          }
        ]
      }),
      new webpack.EnvironmentPlugin({
        NODE_ENV: mode, // Use 'development' unless process.env.NODE_ENV is defined
        DEBUG: false
      }),
      // New FaviconsWebpackPlugin('./assets/logo.png'),
      new HtmlWebpackPlugin({
        title: packageJSON.description,
        scriptLoading: "defer",
        base: "ui/"
      }),
      // New HardSourceWebpackPlugin(),
      new ReactRefreshWebpackPlugin()
    ]
  };
};
