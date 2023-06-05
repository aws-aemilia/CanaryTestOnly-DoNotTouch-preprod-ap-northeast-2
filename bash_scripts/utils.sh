# Logs into an isengard account provided the account id and the console role
# First parameter is account and second is role
function isengard_login() {
    echo -e -n "Logging into $YELLOW$1$NC as $YELLOW$2$NC..."

    TEMP_CRED_JSON=$(curl -b ~/.midway/cookie -c ~/.midway/cookie -L -X POST --header "X-Amz-Target: IsengardService.GetAssumeRoleCredentials" --header "Content-Encoding: amz-1.0" --header "Content-Type:application/json;charset=UTF-8" -d "{\"AWSAccountID\": \"$1\",\"IAMRoleName\" :\"$2\"}" "https://isengard-service.amazon.com" 2>/dev/null | jq ".AssumeRoleResult" -r)
    AWS_ACCESS_KEY_ID=$(echo "$TEMP_CRED_JSON" | jq ".credentials.accessKeyId // empty" -r)
    AWS_SECRET_ACCESS_KEY=$(echo "$TEMP_CRED_JSON" | jq ".credentials.secretAccessKey // empty" -r)
    AWS_SESSION_TOKEN=$(echo "$TEMP_CRED_JSON" | jq ".credentials.sessionToken // empty" -r)

    if [ -z "${AWS_ACCESS_KEY_ID}" ] ; then
        echo -e "${RED}failed$NC"
        echo "Can't get access to account $1 / role $2. Maybe you didn't run mwinit ?"
        exit -1
    fi

    export AWS_ACCESS_KEY_ID
    export AWS_SECRET_ACCESS_KEY
    export AWS_SESSION_TOKEN

    echo -e "${GREEN}done$NC ($YELLOW$AWS_ACCESS_KEY_ID$NC)"
}

# Returns the amplify account given a region airport code $1 and stage $2
function get_amplify_account() {
  local region=$(echo "$1" | tr '[:lower:]' '[:upper:]')
  local stage=$(echo "$2" | tr '[:upper:]' '[:lower:]')

  if [[ -z "$stage" ]]; then
      stage="prod"
  fi

  case $stage in
    prod)
      case $region in
          IAD) echo "073653171576" ;;
          DUB) echo "565036926641" ;;
          PDX) echo "395333095307" ;;
          SFO) echo "214290359175" ;;
          CMH) echo "264748200621" ;;
          YUL) echo "824930503114" ;;
          GRU) echo "068675532419" ;;
          NRT) echo "550167628141" ;;
          ICN) echo "024873182396" ;;
          BOM) echo "801187164913" ;;
          SIN) echo "148414518837" ;;
          SYD) echo "711974673587" ;;
          FRA) echo "644397351177" ;;
          LHR) echo "499901155257" ;;
          CDG) echo "693207358157" ;;
          ARN) echo "315276288780" ;;
          MXP) echo "804516649577" ;;
          HKG) echo "574285171994" ;;
          BAH) echo "183380703454" ;;
      esac ;;
  esac
}

function get_kinesis_consumer_account() {
  local region=$(echo "$1" | tr '[:lower:]' '[:upper:]')
  local stage=$(echo "$2" | tr '[:upper:]' '[:lower:]')

  if [[ -z "$stage" ]]; then
      stage="prod"
  fi

  case $stage in
    prod)
      case $region in
          IAD) echo "967043042790" ;;
          DUB) echo "047809407788" ;;
          PDX) echo "687671821342" ;;
          SFO) echo "339592847097" ;;
          CMH) echo "091431976996" ;;
          YUL) echo "714464483917" ;;
          GRU) echo "492053135252" ;;
          NRT) echo "931081886687" ;;
          ICN) echo "304266899053" ;;
          BOM) echo "800446343048" ;;
          SIN) echo "924747526517" ;;
          SYD) echo "714614077941" ;;
          FRA) echo "707127615593" ;;
          LHR) echo "011359086581" ;;
          CDG) echo "181670507818" ;;
          ARN) echo "385179314969" ;;
          MXP) echo "833498015092" ;;
          HKG) echo "686810132325" ;;
          BAH) echo "381391443810" ;;
      esac ;;
  esac
}

function get_metering_account() {
  local region=$(echo "$1" | tr '[:lower:]' '[:upper:]')
  local stage=$(echo "$2" | tr '[:upper:]' '[:lower:]')

  if [[ -z "$stage" ]]; then
      stage="prod"
  fi

  case $stage in
    prod)
      case $region in
          IAD) echo "075333837457" ;;
          DUB) echo "429558802523" ;;
          PDX) echo "748599178717" ;;
          SFO) echo "841117692638" ;;
          CMH) echo "826784040609" ;;
          YUL) echo "216941712347" ;;
          GRU) echo "900160924945" ;;
          NRT) echo "732582093327" ;;
          ICN) echo "625673226202" ;;
          BOM) echo "836341844952" ;;
          SIN) echo "559733813024" ;;
          SYD) echo "677329203012" ;;
          FRA) echo "862195064974" ;;
          LHR) echo "370736552814" ;;
          CDG) echo "814159152259" ;;
          ARN) echo "164042274351" ;;
          MXP) echo "806145024516" ;;
          HKG) echo "303580556152" ;;
          BAH) echo "038057254658" ;;
      esac ;;
  esac
}

function get_tangerine_account() {
  local region=$(echo "$1" | tr '[:lower:]' '[:upper:]')
  local stage=$(echo "$2" | tr '[:upper:]' '[:lower:]')

  if [[ -z "$stage" ]]; then
      stage="prod"
  fi

  case $stage in
    prod)
      case $region in
          IAD) echo "363699358324" ;;
          DUB) echo "919144713671" ;;
          PDX) echo "483612474985" ;;
          SFO) echo "852317390280" ;;
          CMH) echo "162108643345" ;;
          YUL) echo "500327539313" ;;
          GRU) echo "909518030721" ;;
          NRT) echo "483838015901" ;;
          ICN) echo "744164304127" ;;
          BOM) echo "670962053594" ;;
          SIN) echo "524545448442" ;;
          SYD) echo "307205455551" ;;
          FRA) echo "039068071473" ;;
          LHR) echo "677143461647" ;;
          CDG) echo "718335416750" ;;
          ARN) echo "285725869593" ;;
          MXP) echo "421605908834" ;;
          HKG) echo "591174092451" ;;
          BAH) echo "587873077960" ;;
      esac ;;
  esac
}

function get_amplify_regions() {
  echo "IAD DUB PDX SFO CMH YUL GRU NRT ICN BOM SIN SYD FRA LHR CDG ARN MXP HKG BAH"
}

# Returns the region name given airport code
function get_region_name() {
    local region=$1
    case $region in
        IAD) echo "us-east-1" ;;
        DUB) echo "eu-west-1" ;;
        PDX) echo "us-west-2" ;;
        SFO) echo "us-west-1" ;;
        CMH) echo "us-east-2" ;;
        YUL) echo "ca-central-1" ;;
        GRU) echo "sa-east-1" ;;
        NRT) echo "ap-northeast-1" ;;
        ICN) echo "ap-northeast-2" ;;
        BOM) echo "ap-south-1" ;;
        SIN) echo "ap-southeast-1" ;;
        SYD) echo "ap-southeast-2" ;;
        FRA) echo "eu-central-1" ;;
        LHR) echo "eu-west-2" ;;
        CDG) echo "eu-west-3" ;;
        ARN) echo "eu-north-1" ;;
        MXP) echo "eu-south-1" ;;
        HKG) echo "ap-east-1" ;;
        BAH) echo "me-south-1" ;;
    esac
}