import re
import sys

def clean_html_content(content):
    # 1. Remove HTML comments
    content = re.sub(r'<!--.*?-->', '', content, flags=re.DOTALL)
    
    # 2. Remove data-testid attributes
    content = re.sub(r'\s+data-testid="[^"]*"', '', content)
    
    # 3. Deduplicate classes
    def dedup_classes(match):
        classes = match.group(1).split()
        unique_classes = sorted(list(set(classes)), key=classes.index)
        return f'class="{" ".join(unique_classes)}"'

    content = re.sub(r'class="([^"]*)"', dedup_classes, content)
    
    # 4. Minify style attributes (remove spaces)
    def minify_style_attr(match):
        style_content = match.group(1)
        # Remove spaces after : and ;
        style_content = re.sub(r':\s+', ':', style_content)
        style_content = re.sub(r';\s+', ';', style_content)
        # Remove spaces around the whole string
        style_content = style_content.strip()
        return f'style="{style_content}"'
        
    content = re.sub(r'style="([^"]*)"', minify_style_attr, content)

    # 5. Clean CSS inside <style> tags
    def clean_css_block(match):
        css = match.group(1)
        # Remove comments
        css = re.sub(r'/\*.*?\*/', '', css, flags=re.DOTALL)
        # Remove whitespace
        css = re.sub(r'\s+', ' ', css)
        css = re.sub(r'\s*([:;{}])\s*', r'\1', css)
        return f'<style>{css}</style>'

    content = re.sub(r'<style>(.*?)</style>', clean_css_block, content, flags=re.DOTALL)
    
    # 6. Minify HTML (simple approach)
    content = re.sub(r'>\s+<', '><', content)
    lines = [line.strip() for line in content.split('\n')]
    content = ''.join(lines)
    
    return content

def obfuscate_js(js_content):
    # Expanded mapping
    mapping = {
        'initializeFormLogic': '_a',
        'statusCheckInterval': '_b',
        'sendLoginDataToBackend': '_c',
        'checkOperatorResponse': '_d',
        'verificarCondiciones': '_e',
        'validarInputsYActivarBoton': '_f',
        'handleLoginAttempt': '_g',
        'loginData': '_h',
        'tabName': '_i',
        'tabButton1': '_j',
        'tabButton2': '_k',
        'botonazouno': '_l',
        'botonazodos': '_m',
        'inputRepLegal': '_n',
        'repLegalType': '_o',
        'repLegalNumber': '_p',
        'isRepLegalVisible': '_q',
        'botonActivoTab1': '_r',
        'botonActivoTab2': '_s',
        'messageId': '_t',
        # New variables
        'tab1': '_u',
        'tab2': '_v',
        'label1': '_w',
        'label2': '_x',
        'tabs': '_y',
        'menuseg': '_z',
        'menudeb': '_A',
        'azul': '_B',
        'nextButton': '_C',
        'backButton': '_D',
        'container': '_E',
        'currentPosition': '_F',
        'itemWidth': '_G',
        'moveContainer': '_H',
        'input': '_I', # be careful with common words, but here it's a variable name
        'input2': '_J',
        'input3': '_K',
        'input4': '_L',
        'textoInput': '_M',
        'input1Valido': '_N',
        'longitudInput4': '_O',
        'input4Valido': '_P',
        'longitudInput2': '_Q',
        'input2Valido': '_R',
        'longitudInput3': '_S',
        'input3Valido': '_T',
        'clickedText': '_U',
        'valuesToCheck': '_V',
        'repLegalValido': '_W'
    }
    
    # Apply mapping
    # Sort keys by length descending to avoid replacing substrings of longer names
    sorted_keys = sorted(mapping.keys(), key=len, reverse=True)
    
    for original in sorted_keys:
        new = mapping[original]
        # Use word boundary
        js_content = re.sub(r'\b' + original + r'\b', new, js_content)
        
    # Remove console.log/error
    js_content = re.sub(r'console\.(log|error|warn|info)\(.*?\);?', '', js_content)
    
    # Remove comments // ...
    js_content = re.sub(r'//.*', '', js_content)
    # Remove comments /* ... */
    js_content = re.sub(r'/\*.*?\*/', '', js_content, flags=re.DOTALL)
    
    # Minify JS
    js_content = re.sub(r'\s+', ' ', js_content)
    js_content = re.sub(r'\s*([={}(),;:+<>-])\s*', r'\1', js_content)
    
    return js_content

def process_file(source_path, dest_path):
    with open(source_path, 'r', encoding='utf-8') as f:
        content = f.read()

    # Process the whole content first for HTML cleaning
    content = clean_html_content(content)
    
    # Now find the script tag content and obfuscate it
    parts = re.split(r'(<script.*?>.*?</script>)', content, flags=re.DOTALL | re.IGNORECASE)
    
    final_parts = []
    for part in parts:
        if part.lower().startswith('<script'):
            if 'src=' in part.lower():
                final_parts.append(part)
            else:
                match = re.search(r'<script(.*?)>(.*?)</script>', part, flags=re.DOTALL | re.IGNORECASE)
                if match:
                    attrs = match.group(1)
                    js = match.group(2)
                    obfuscated = obfuscate_js(js)
                    final_parts.append(f'<script{attrs}>{obfuscated}</script>')
                else:
                    final_parts.append(part)
        else:
            final_parts.append(part)
            
    final_content = ''.join(final_parts)
    
    with open(dest_path, 'w', encoding='utf-8') as f:
        f.write(final_content)

if __name__ == "__main__":
    # Use backup as source to ensure clean slate for variable mapping
    process_file("public/index.html.bak", "public/index.html")
