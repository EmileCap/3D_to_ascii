import {getCharset} from './charsets.js';
import {validateSettings} from './settings.js';
import {colorFor} from './colors.js';
import {sobel,edgeGlyph} from './edges.js';
export const glyphAspect = 0.62;
export function imageHeight(w,r){return Math.max(1,Math.round(w*r))}
export function convertPixels(pixels,width,height,settings={}){const s=validateSettings(settings),chars=getCharset(s.charset,s.customCharset),edge=s.edges?sobel(pixels,width,height,s.threshold):null,rows=[],colors=[];for(let y=0;y<height;y++){let row='',cr=[];for(let x=0;x<width;x++){let i=(y*width+x)*4,lum=(.2126*pixels[i]+.7152*pixels[i+1]+.0722*pixels[i+2])/255;lum=Math.max(0,Math.min(1,lum*s.contrast+s.brightness));lum=Math.pow(lum,1/s.gamma);let ci=Math.round(lum*(chars.length-1));if(s.invert)ci=chars.length-1-ci;row+=edge&&edge[y*width+x]?edgeGlyph(edge[y*width+x]):chars[ci];cr.push(colorFor(lum,s,[pixels[i],pixels[i+1],pixels[i+2]]))}rows.push(row);colors.push(cr)}return{text:rows.join('\n'),rows,colors,width,height,settings:s}}
