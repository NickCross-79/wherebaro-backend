import fs from 'fs/promises';
import os from 'os';
import path from 'path';
import { load } from 'cheerio';

const baroDataURL = "https://wiki.warframe.com/w/Module:Baro/data?action=edit";

const getLuaData = async (url: string): Promise<string> => {
  try {
    const $ = load(await fetch(url).then((data) => data.text()));
    return $('#wpTextbox1').text();
  } catch (err) {
    console.error('Failed to fetch latest Lua data:');
    console.error(err);
    return '';
  }
};

function luaToJson(luaString: string): any {
  // Remove comments
  let str = luaString.replace(/--[^\n]*/g, '');
  
  // Remove return statement
  str = str.replace(/^\s*return\s+/, '').trim();
  
  let pos = 0;
  
  function skipWhitespace() {
    while (pos < str.length && /\s/.test(str[pos])) {
      pos++;
    }
  }
  
  function parseValue(): any {
    skipWhitespace();
    
    if (pos >= str.length) return null;
    
    // String
    if (str[pos] === '"') {
      pos++;
      let value = '';
      while (pos < str.length && str[pos] !== '"') {
        if (str[pos] === '\\') {
          pos++;
        }
        value += str[pos++];
      }
      pos++; // Skip closing quote
      return value;
    }
    
    // Number
    if (/[0-9-]/.test(str[pos])) {
      let value = '';
      while (pos < str.length && /[0-9.-]/.test(str[pos])) {
        value += str[pos++];
      }
      return parseFloat(value);
    }
    
    // Boolean or nil
    if (str.substring(pos, pos + 4) === 'true') {
      pos += 4;
      return true;
    }
    if (str.substring(pos, pos + 5) === 'false') {
      pos += 5;
      return false;
    }
    if (str.substring(pos, pos + 3) === 'nil') {
      pos += 3;
      return null;
    }
    
    // Table
    if (str[pos] === '{') {
      pos++;
      skipWhitespace();
      
      // Empty table
      if (str[pos] === '}') {
        pos++;
        return {};
      }
      
      // Determine if array or object
      const startPos = pos;
      let isArray = true;
      let tempPos = pos;
      
      // Peek ahead to check structure
      while (tempPos < str.length && str[tempPos] !== '}') {
        // Skip whitespace
        while (tempPos < str.length && /\s/.test(str[tempPos])) tempPos++;
        
        // Check for key pattern: ["key"] = or key =
        if (str[tempPos] === '[' || (str[tempPos] !== '"' && str[tempPos] !== '{')) {
          const nextEq = str.indexOf('=', tempPos);
          const nextComma = str.indexOf(',', tempPos);
          const nextBrace = str.indexOf('}', tempPos);
          
          if (nextEq !== -1 && (nextComma === -1 || nextEq < nextComma) && (nextBrace === -1 || nextEq < nextBrace)) {
            isArray = false;
            break;
          }
        }
        
        // Move to next element
        let depth = 0;
        while (tempPos < str.length) {
          if (str[tempPos] === '{') depth++;
          if (str[tempPos] === '}') depth--;
          if (depth === 0 && str[tempPos] === ',') break;
          if (depth === -1) break;
          tempPos++;
        }
        if (str[tempPos] === ',') tempPos++;
      }
      
      // Parse as array or object
      if (isArray) {
        const arr: any[] = [];
        while (pos < str.length && str[pos] !== '}') {
          skipWhitespace();
          if (str[pos] === '}') break;
          
          arr.push(parseValue());
          skipWhitespace();
          
          if (str[pos] === ',') pos++;
        }
        pos++; // Skip closing }
        return arr;
      } else {
        const obj: any = {};
        while (pos < str.length && str[pos] !== '}') {
          skipWhitespace();
          if (str[pos] === '}') break;
          
          // Parse key
          let key = '';
          if (str[pos] === '[') {
            pos++; // Skip [
            skipWhitespace();
            if (str[pos] === '"') {
              pos++;
              while (pos < str.length && str[pos] !== '"') {
                key += str[pos++];
              }
              pos++; // Skip closing "
            }
            skipWhitespace();
            pos++; // Skip ]
          } else {
            // Bare key
            while (pos < str.length && /[a-zA-Z0-9_]/.test(str[pos])) {
              key += str[pos++];
            }
          }
          
          skipWhitespace();
          pos++; // Skip =
          skipWhitespace();
          
          obj[key] = parseValue();
          skipWhitespace();
          
          if (str[pos] === ',') pos++;
        }
        pos++; // Skip closing }
        return obj;
      }
    }
    
    return null;
  }
  
  return parseValue();
}

async function scrape() {
  const luaData = await getLuaData(baroDataURL);
  const jsonData = luaToJson(luaData);
  return jsonData;
}

export { scrape };