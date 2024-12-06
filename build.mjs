import * as esbuild from 'esbuild';
import { sassPlugin } from 'esbuild-sass-plugin';

const ctx = await esbuild.context({
    entryPoints: ['src/main.tsx'],
    bundle: true,
    minify: false,
    sourcemap: true,
    target: ['es2020'],
    plugins: [sassPlugin()],
    outdir: 'dist/js',
});

if (process.env.NODE_ENV === 'production') {
    await ctx.rebuild();
    console.log('Build succeeded.');
    process.exit(0);
} else {
    await ctx.watch();
    // let { host, port } = await ctx.serve({
    //     servedir: 'dist',
    //     onRequest: () => {
    //     }
    // });

    // console.log('Build succeeded. Serving on http://' + host + ':' + port);
    // console.log("Watching for changes...");
}