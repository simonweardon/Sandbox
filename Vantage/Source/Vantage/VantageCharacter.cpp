#include "VantageCharacter.h"

#include "Revolver.h"
#include "VantageGameMode.h"
#include "ZombieCharacter.h"

#include "Camera/CameraComponent.h"
#include "Components/CapsuleComponent.h"
#include "Components/SkeletalMeshComponent.h"
#include "Components/SpotLightComponent.h"
#include "Components/StaticMeshComponent.h"
#include "EnhancedInputComponent.h"
#include "EnhancedInputSubsystems.h"
#include "Engine/LocalPlayer.h"
#include "Engine/StaticMesh.h"
#include "Engine/World.h"
#include "GameFramework/CharacterMovementComponent.h"
#include "GameFramework/PlayerController.h"
#include "GameFramework/SpringArmComponent.h"
#include "InputAction.h"
#include "InputActionValue.h"
#include "InputMappingContext.h"
#include "InputModifiers.h"
#include "Materials/MaterialInstanceDynamic.h"
#include "TimerManager.h"
#include "UObject/ConstructorHelpers.h"

namespace
{
	constexpr float MeshHalfSize = 50.f;

	const FLinearColor SkinColour    (0.600f, 0.410f, 0.290f);
	const FLinearColor CoatColour    (0.270f, 0.185f, 0.120f);
	const FLinearColor ShirtColour   (0.415f, 0.355f, 0.270f);
	const FLinearColor TrouserColour (0.190f, 0.170f, 0.160f);
	const FLinearColor HairColour    (0.155f, 0.100f, 0.065f);
}

AVantageCharacter::AVantageCharacter()
{
	PrimaryActorTick.bCanEverTick = true;

	GetCapsuleComponent()->InitCapsuleSize(38.f, 92.f);

	// Third person, but he still faces wherever the camera looks: the gun has to
	// point where the crosshair is, and turning the body to the aim is the only
	// way to get that without an aim-offset animation blend.
	bUseControllerRotationPitch = false;
	bUseControllerRotationYaw = true;
	bUseControllerRotationRoll = false;

	UCharacterMovementComponent* Movement = GetCharacterMovement();
	Movement->bOrientRotationToMovement = false;
	Movement->MaxWalkSpeed = WalkSpeed;
	Movement->MaxWalkSpeedCrouched = 230.f;
	Movement->JumpZVelocity = 480.f;
	Movement->AirControl = 0.35f;
	Movement->BrakingDecelerationWalking = 2000.f;
	Movement->SetCrouchedHalfHeight(55.f);
	Movement->GetNavAgentPropertiesRef().bCanCrouch = true;

	SpringArm = CreateDefaultSubobject<USpringArmComponent>(TEXT("SpringArm"));
	SpringArm->SetupAttachment(GetCapsuleComponent());
	SpringArm->SetRelativeLocation(FVector(0.f, 0.f, 62.f));
	SpringArm->TargetArmLength = 285.f;
	SpringArm->bUsePawnControlRotation = true;
	// Offset to the right so the body does not sit on the crosshair.
	SpringArm->SocketOffset = FVector(0.f, 68.f, 22.f);
	SpringArm->bDoCollisionTest = true;
	SpringArm->ProbeSize = 14.f;

	Camera = CreateDefaultSubobject<UCameraComponent>(TEXT("Camera"));
	Camera->SetupAttachment(SpringArm, USpringArmComponent::SocketName);
	Camera->bUsePawnControlRotation = false;
	Camera->FieldOfView = 90.f;

	BodyRoot = CreateDefaultSubobject<USceneComponent>(TEXT("BodyRoot"));
	BodyRoot->SetupAttachment(GetCapsuleComponent());

	// Everything from the shoulders out hangs off this, so a single pitch makes
	// the arm, the gun and the light all track the aim together.
	AimPivot = CreateDefaultSubobject<USceneComponent>(TEXT("AimPivot"));
	AimPivot->SetupAttachment(BodyRoot);
	AimPivot->SetRelativeLocation(FVector(0.f, 0.f, 44.f));

	// Built around the capsule centre: feet at -92, crown near +90.
	LeftLeg  = AddBodyPart(TEXT("LeftLeg"),  BodyRoot, FVector(0.f, -13.f, -52.f), FVector(11.f, 10.f, 40.f), FRotator::ZeroRotator, TrouserColour);
	RightLeg = AddBodyPart(TEXT("RightLeg"), BodyRoot, FVector(0.f, 13.f, -52.f),  FVector(11.f, 10.f, 40.f), FRotator::ZeroRotator, TrouserColour);
	Torso    = AddBodyPart(TEXT("Torso"),    BodyRoot, FVector(0.f, 0.f, 20.f),    FVector(15.f, 22.f, 30.f), FRotator::ZeroRotator, ShirtColour);
	Coat     = AddBodyPart(TEXT("Coat"),     BodyRoot, FVector(-2.f, 0.f, 6.f),    FVector(17.f, 24.f, 24.f), FRotator::ZeroRotator, CoatColour);

	Head     = AddBodyPart(TEXT("Head"),     BodyRoot, FVector(2.f, 0.f, 74.f),    FVector(12.f, 11.f, 13.f), FRotator::ZeroRotator, SkinColour);
	Hair     = AddBodyPart(TEXT("Hair"),     BodyRoot, FVector(0.f, 0.f, 86.f),    FVector(12.5f, 11.5f, 4.f), FRotator::ZeroRotator, HairColour);

	// The beard: a full jaw piece, a tapering point below it, and a moustache
	// sitting proud of the face.
	Beard      = AddBodyPart(TEXT("Beard"),      BodyRoot, FVector(9.f, 0.f, 63.f),  FVector(7.f, 10.f, 11.f),  FRotator::ZeroRotator, HairColour);
	BeardTaper = AddBodyPart(TEXT("BeardTaper"), BodyRoot, FVector(8.f, 0.f, 49.f),  FVector(5.f, 6.5f, 6.f),   FRotator(6.f, 0.f, 0.f), HairColour);
	Moustache  = AddBodyPart(TEXT("Moustache"),  BodyRoot, FVector(13.f, 0.f, 71.f), FVector(2.5f, 7.5f, 2.5f), FRotator::ZeroRotator, HairColour);

	// Gun arm hangs off the aim pivot; the free arm swings with the walk.
	GunArm  = AddBodyPart(TEXT("GunArm"),  AimPivot, FVector(16.f, 20.f, 0.f),   FVector(8.f, 8.f, 26.f), FRotator(72.f, 0.f, 0.f), CoatColour);
	FreeArm = AddBodyPart(TEXT("FreeArm"), BodyRoot, FVector(0.f, -24.f, 20.f),  FVector(8.f, 8.f, 27.f), FRotator(8.f, 0.f, 0.f),  CoatColour);

	GunHand = CreateDefaultSubobject<USceneComponent>(TEXT("GunHand"));
	GunHand->SetupAttachment(AimPivot);
	GunHand->SetRelativeLocation(FVector(42.f, 20.f, 1.f));

	Flashlight = CreateDefaultSubobject<USpotLightComponent>(TEXT("Flashlight"));
	Flashlight->SetupAttachment(AimPivot);
	Flashlight->SetRelativeLocation(FVector(30.f, 14.f, 4.f));
	Flashlight->IntensityUnits = ELightUnits::Unitless;
	Flashlight->Intensity = 60000.f;
	Flashlight->AttenuationRadius = 3000.f;
	Flashlight->InnerConeAngle = 16.f;
	Flashlight->OuterConeAngle = 33.f;
	Flashlight->LightColor = FColor(255, 244, 219);
	Flashlight->CastShadows = true;
	Flashlight->SetVisibility(false);

	// No mesh and no animation assets, so the inherited skeletal mesh is dead
	// weight. Hidden rather than removed, since ACharacter expects it present.
	GetMesh()->SetVisibility(false);
	GetMesh()->SetCollisionEnabled(ECollisionEnabled::NoCollision);
}

UStaticMeshComponent* AVantageCharacter::AddBodyPart(const TCHAR* Name, USceneComponent* Parent, const FVector& Location, const FVector& HalfExtent, const FRotator& Rotation, const FLinearColor& Colour)
{
	static ConstructorHelpers::FObjectFinder<UStaticMesh> CubeFinder(TEXT("/Engine/BasicShapes/Cube.Cube"));

	UStaticMeshComponent* Part = CreateDefaultSubobject<UStaticMeshComponent>(Name);
	Part->SetupAttachment(Parent);
	Part->SetRelativeLocation(Location);
	Part->SetRelativeRotation(Rotation);
	Part->SetRelativeScale3D(HalfExtent / MeshHalfSize);

	if (CubeFinder.Succeeded())
	{
		Part->SetStaticMesh(CubeFinder.Object);
	}

	// The player's own geometry must never block his own shot, and the capsule
	// already handles bumping into things.
	Part->SetCollisionEnabled(ECollisionEnabled::NoCollision);

	return Part;
}

void AVantageCharacter::PostInitializeComponents()
{
	Super::PostInitializeComponents();
	BuildInputBindings();
}

void AVantageCharacter::BeginPlay()
{
	Super::BeginPlay();

	Health = MaxHealth;

	// Constructor-time tinting would apply to the class default object, so the
	// dynamic material instances are made here instead.
	auto Tint = [](UStaticMeshComponent* Part, const FLinearColor& Colour)
	{
		if (!Part)
		{
			return;
		}
		if (UMaterialInstanceDynamic* Material = Part->CreateAndSetMaterialInstanceDynamic(0))
		{
			Material->SetVectorParameterValue(TEXT("Color"), Colour);
		}
	};

	Tint(LeftLeg, TrouserColour);
	Tint(RightLeg, TrouserColour);
	Tint(Torso, ShirtColour);
	Tint(Coat, CoatColour);
	Tint(Head, SkinColour);
	Tint(Hair, HairColour);
	Tint(Beard, HairColour);
	Tint(BeardTaper, HairColour);
	Tint(Moustache, HairColour);
	Tint(GunArm, CoatColour);
	Tint(FreeArm, CoatColour);

	FActorSpawnParameters SpawnParams;
	SpawnParams.Owner = this;
	SpawnParams.SpawnCollisionHandlingOverride = ESpawnActorCollisionHandlingMethod::AlwaysSpawn;

	Revolver = GetWorld()->SpawnActor<ARevolver>(FVector::ZeroVector, FRotator::ZeroRotator, SpawnParams);
	if (Revolver)
	{
		Revolver->AttachToComponent(GunHand, FAttachmentTransformRules::SnapToTargetNotIncludingScale);
		Revolver->SetActorRelativeLocation(FVector::ZeroVector);
		Revolver->SetActorRelativeRotation(FRotator::ZeroRotator);
		// Held at arm's length now rather than at the near plane, so it can be
		// seen properly and wants to be a little larger than life.
		Revolver->SetActorRelativeScale3D(FVector(1.35f));
	}
	else
	{
		UE_LOG(LogTemp, Error, TEXT("Vantage: revolver failed to spawn; the player is unarmed."));
	}

	GetWorldTimerManager().SetTimer(FallCheckTimer, this, &AVantageCharacter::CheckForFall, 0.5f, true);
	GetWorldTimerManager().SetTimer(InputWatchdogTimer, this, &AVantageCharacter::ReportSilentInput, 8.f, false);
}

void AVantageCharacter::Tick(float DeltaSeconds)
{
	Super::Tick(DeltaSeconds);

	DamageFlash = FMath::Max(DamageFlash - DeltaSeconds * 1.6f, 0.f);
	HitMarker = FMath::Max(HitMarker - DeltaSeconds * 3.2f, 0.f);

	UpdateBody(DeltaSeconds);

	if (bDown)
	{
		return;
	}

	// Regenerate only after a clear spell, so a fight still has a cost.
	TimeSinceDamage += DeltaSeconds;
	if (TimeSinceDamage > RegenDelay && Health < MaxHealth)
	{
		Health = FMath::Min(Health + RegenPerSecond * DeltaSeconds, MaxHealth);
	}
}

void AVantageCharacter::UpdateBody(float DeltaSeconds)
{
	if (bDown)
	{
		// Slump forward and stay there until Revive puts him back.
		const FRotator Slumped(78.f, 0.f, 12.f);
		BodyRoot->SetRelativeRotation(FMath::RInterpTo(BodyRoot->GetRelativeRotation(), Slumped, DeltaSeconds, 5.f));
		BodyRoot->SetRelativeLocation(FMath::VInterpTo(BodyRoot->GetRelativeLocation(), FVector(20.f, 0.f, -46.f), DeltaSeconds, 5.f));
		return;
	}

	BodyRoot->SetRelativeRotation(FRotator::ZeroRotator);

	// One phase drives the whole walk: legs opposed, free arm counter-swinging,
	// and a bob at twice the rate so both footfalls read.
	const float Speed = GetVelocity().Size2D();
	const float Target = FMath::Clamp(Speed / FMath::Max(WalkSpeed, 1.f), 0.f, 1.7f);
	GaitBlend = FMath::FInterpTo(GaitBlend, Target, DeltaSeconds, 7.f);
	GaitPhase += DeltaSeconds * (5.2f + GaitBlend * 3.4f);

	const float Swing = FMath::Sin(GaitPhase) * GaitBlend;

	if (LeftLeg && RightLeg)
	{
		LeftLeg->SetRelativeRotation(FRotator(Swing * 34.f, 0.f, 0.f));
		RightLeg->SetRelativeRotation(FRotator(-Swing * 34.f, 0.f, 0.f));
	}

	if (FreeArm)
	{
		FreeArm->SetRelativeRotation(FRotator(8.f - Swing * 22.f, 0.f, 0.f));
	}

	BodyRoot->SetRelativeLocation(FVector(0.f, 0.f, FMath::Abs(FMath::Sin(GaitPhase)) * 2.6f * GaitBlend));

	// The arm and gun follow the camera's pitch, so he aims where you look.
	if (AimPivot && Controller)
	{
		const float AimPitch = FRotator::NormalizeAxis(Controller->GetControlRotation().Pitch);
		AimPivot->SetRelativeRotation(FRotator(AimPitch, 0.f, 0.f));
	}
}

void AVantageCharacter::BuildInputBindings()
{
	if (InputContext)
	{
		return;
	}

	InputContext = NewObject<UInputMappingContext>(this, TEXT("VantageInputContext"));

	auto MakeAction = [this](const TCHAR* Name, EInputActionValueType Type) -> UInputAction*
	{
		UInputAction* Action = NewObject<UInputAction>(this, Name);
		Action->ValueType = Type;
		return Action;
	};

	MoveAction       = MakeAction(TEXT("IA_Move"),       EInputActionValueType::Axis2D);
	LookAction       = MakeAction(TEXT("IA_Look"),       EInputActionValueType::Axis2D);
	LookRateAction   = MakeAction(TEXT("IA_LookRate"),   EInputActionValueType::Axis2D);
	JumpAction       = MakeAction(TEXT("IA_Jump"),       EInputActionValueType::Boolean);
	SprintAction     = MakeAction(TEXT("IA_Sprint"),     EInputActionValueType::Boolean);
	CrouchAction     = MakeAction(TEXT("IA_Crouch"),     EInputActionValueType::Boolean);
	FireAction       = MakeAction(TEXT("IA_Fire"),       EInputActionValueType::Boolean);
	ReloadAction     = MakeAction(TEXT("IA_Reload"),     EInputActionValueType::Boolean);
	FlashlightAction = MakeAction(TEXT("IA_Flashlight"), EInputActionValueType::Boolean);

	// A key press lands on the X axis, so anything that should read as
	// forward/back needs swizzling into Y first, then negating if it points the
	// other way. Modifiers apply in array order.
	auto MapAxis = [this](UInputAction* Action, const FKey& Key, bool bSwizzleToY, bool bNegate)
	{
		FEnhancedActionKeyMapping& Mapping = InputContext->MapKey(Action, Key);
		if (bSwizzleToY)
		{
			UInputModifierSwizzleAxis* Swizzle = NewObject<UInputModifierSwizzleAxis>(InputContext);
			Swizzle->Order = EInputAxisSwizzle::YXZ;
			Mapping.Modifiers.Add(Swizzle);
		}
		if (bNegate)
		{
			Mapping.Modifiers.Add(NewObject<UInputModifierNegate>(InputContext));
		}
	};

	MapAxis(MoveAction, EKeys::W, /*Swizzle*/ true,  /*Negate*/ false);
	MapAxis(MoveAction, EKeys::S, /*Swizzle*/ true,  /*Negate*/ true);
	MapAxis(MoveAction, EKeys::D, /*Swizzle*/ false, /*Negate*/ false);
	MapAxis(MoveAction, EKeys::A, /*Swizzle*/ false, /*Negate*/ true);
	MapAxis(MoveAction, EKeys::Up,    true,  false);
	MapAxis(MoveAction, EKeys::Down,  true,  true);
	MapAxis(MoveAction, EKeys::Right, false, false);
	MapAxis(MoveAction, EKeys::Left,  false, true);
	MapAxis(MoveAction, EKeys::Gamepad_LeftX, false, false);
	MapAxis(MoveAction, EKeys::Gamepad_LeftY, true,  false);

	// Mouse deltas are already frame independent; stick deflection is not, so it
	// gets its own action that LookRate scales by delta time.
	InputContext->MapKey(LookAction, EKeys::Mouse2D);
	MapAxis(LookRateAction, EKeys::Gamepad_RightX, false, false);
	MapAxis(LookRateAction, EKeys::Gamepad_RightY, true,  false);

	InputContext->MapKey(JumpAction, EKeys::SpaceBar);
	InputContext->MapKey(JumpAction, EKeys::Gamepad_FaceButton_Bottom);
	InputContext->MapKey(SprintAction, EKeys::LeftShift);
	InputContext->MapKey(SprintAction, EKeys::Gamepad_LeftThumbstick);
	InputContext->MapKey(CrouchAction, EKeys::LeftControl);
	InputContext->MapKey(CrouchAction, EKeys::C);
	InputContext->MapKey(CrouchAction, EKeys::Gamepad_FaceButton_Right);
	InputContext->MapKey(FireAction, EKeys::LeftMouseButton);
	InputContext->MapKey(FireAction, EKeys::Gamepad_RightTrigger);
	InputContext->MapKey(ReloadAction, EKeys::R);
	InputContext->MapKey(ReloadAction, EKeys::Gamepad_FaceButton_Left);
	InputContext->MapKey(FlashlightAction, EKeys::F);
	InputContext->MapKey(FlashlightAction, EKeys::Gamepad_FaceButton_Top);
}

void AVantageCharacter::SetupPlayerInputComponent(UInputComponent* PlayerInputComponent)
{
	Super::SetupPlayerInputComponent(PlayerInputComponent);

	BuildInputBindings();

	// Two things can fail here, and both fail silently by default, so each one
	// gets its own error. Between them they cover every "nothing responds to the
	// keyboard" case short of the plugin being disabled outright.
	const APlayerController* PC = Cast<APlayerController>(GetController());
	UEnhancedInputLocalPlayerSubsystem* Subsystem = PC
		? ULocalPlayer::GetSubsystem<UEnhancedInputLocalPlayerSubsystem>(PC->GetLocalPlayer())
		: nullptr;

	if (Subsystem)
	{
		Subsystem->AddMappingContext(InputContext, 0);
	}
	else
	{
		UE_LOG(LogTemp, Error,
			TEXT("Vantage: no EnhancedInputLocalPlayerSubsystem. Check that DefaultPlayerInputClass ")
			TEXT("in Config/DefaultInput.ini is /Script/EnhancedInput.EnhancedPlayerInput."));
	}

	UEnhancedInputComponent* Input = Cast<UEnhancedInputComponent>(PlayerInputComponent);
	if (!Input)
	{
		UE_LOG(LogTemp, Error,
			TEXT("Vantage: pawn was given a plain UInputComponent. Set DefaultInputComponentClass ")
			TEXT("in Config/DefaultInput.ini to /Script/EnhancedInput.EnhancedInputComponent."));
		return;
	}

	Input->BindAction(MoveAction, ETriggerEvent::Triggered, this, &AVantageCharacter::Move);
	Input->BindAction(LookAction, ETriggerEvent::Triggered, this, &AVantageCharacter::Look);
	Input->BindAction(LookRateAction, ETriggerEvent::Triggered, this, &AVantageCharacter::LookRate);
	Input->BindAction(JumpAction, ETriggerEvent::Started, this, &ACharacter::Jump);
	Input->BindAction(JumpAction, ETriggerEvent::Completed, this, &ACharacter::StopJumping);
	Input->BindAction(SprintAction, ETriggerEvent::Started, this, &AVantageCharacter::StartSprint);
	Input->BindAction(SprintAction, ETriggerEvent::Completed, this, &AVantageCharacter::StopSprint);
	Input->BindAction(CrouchAction, ETriggerEvent::Started, this, &AVantageCharacter::ToggleCrouch);
	Input->BindAction(FireAction, ETriggerEvent::Started, this, &AVantageCharacter::FireWeapon);
	Input->BindAction(ReloadAction, ETriggerEvent::Started, this, &AVantageCharacter::ReloadWeapon);
	Input->BindAction(FlashlightAction, ETriggerEvent::Started, this, &AVantageCharacter::ToggleFlashlight);
}

void AVantageCharacter::Move(const FInputActionValue& Value)
{
	bReceivedAnyInput = true;

	const FVector2D Axis = Value.Get<FVector2D>();
	if (!Controller || bDown || Axis.IsNearlyZero())
	{
		return;
	}

	// Movement is flattened to the yaw plane so looking up does not slow you down.
	const FRotator YawOnly(0.f, Controller->GetControlRotation().Yaw, 0.f);
	const FRotationMatrix YawFrame(YawOnly);

	AddMovementInput(YawFrame.GetUnitAxis(EAxis::X), Axis.Y);
	AddMovementInput(YawFrame.GetUnitAxis(EAxis::Y), Axis.X);
}

void AVantageCharacter::Look(const FInputActionValue& Value)
{
	bReceivedAnyInput = true;

	const FVector2D Axis = Value.Get<FVector2D>();
	AddControllerYawInput(Axis.X * MouseSensitivity);
	AddControllerPitchInput(-Axis.Y * MouseSensitivity);
}

void AVantageCharacter::LookRate(const FInputActionValue& Value)
{
	const FVector2D Axis = Value.Get<FVector2D>();
	const float Delta = GetWorld() ? GetWorld()->GetDeltaSeconds() : 0.f;

	AddControllerYawInput(Axis.X * GamepadLookRate * Delta);
	AddControllerPitchInput(-Axis.Y * GamepadLookRate * Delta);
}

void AVantageCharacter::StartSprint()
{
	GetCharacterMovement()->MaxWalkSpeed = SprintSpeed;
}

void AVantageCharacter::StopSprint()
{
	GetCharacterMovement()->MaxWalkSpeed = WalkSpeed;
}

void AVantageCharacter::ToggleCrouch()
{
	if (bIsCrouched)
	{
		UnCrouch();
	}
	else
	{
		Crouch();
	}
}

void AVantageCharacter::ToggleFlashlight()
{
	if (Flashlight)
	{
		Flashlight->ToggleVisibility();
	}
}

void AVantageCharacter::FireWeapon()
{
	bReceivedAnyInput = true;

	if (bDown || !Revolver)
	{
		return;
	}

	if (!Revolver->Fire())
	{
		// Dry click on an empty gun starts the reload rather than doing nothing.
		if (Revolver->IsEmpty())
		{
			Revolver->BeginReload();
		}
		return;
	}

	AddControllerPitchInput(-Revolver->RecoilPitch);
	ResolveShot();
}

void AVantageCharacter::ResolveShot()
{
	const APlayerController* PC = Cast<APlayerController>(GetController());
	if (!PC)
	{
		return;
	}

	// Trace from the view point, not the muzzle. In third person the camera sits
	// behind and right of him, so this is what puts the round under the
	// crosshair rather than wherever the barrel happens to be pointing.
	FVector ViewLocation;
	FRotator ViewRotation;
	PC->GetPlayerViewPoint(ViewLocation, ViewRotation);

	FCollisionQueryParams Params(SCENE_QUERY_STAT(VantageShot), true, this);
	Params.AddIgnoredActor(this);
	if (Revolver)
	{
		Params.AddIgnoredActor(Revolver);
	}

	FHitResult Hit;
	const bool bHit = GetWorld()->LineTraceSingleByChannel(
		Hit,
		ViewLocation,
		ViewLocation + ViewRotation.Vector() * ShotRange,
		ECC_Visibility,
		Params);

	if (!bHit)
	{
		return;
	}

	AZombieCharacter* Zombie = Cast<AZombieCharacter>(Hit.GetActor());
	if (!Zombie || Zombie->IsDead())
	{
		return;
	}

	const bool bHeadshot = Hit.Component.IsValid() && Hit.Component->ComponentHasTag(AZombieCharacter::HeadTag);
	Zombie->ApplyHit(BodyDamage, bHeadshot);

	bLastHitHeadshot = bHeadshot;
	HitMarker = 1.f;
}

void AVantageCharacter::ReloadWeapon()
{
	bReceivedAnyInput = true;

	if (!bDown && Revolver)
	{
		Revolver->BeginReload();
	}
}

void AVantageCharacter::TakeZombieHit(float Damage)
{
	if (bDown)
	{
		return;
	}

	Health = FMath::Max(Health - Damage, 0.f);
	TimeSinceDamage = 0.f;
	DamageFlash = 1.f;

	if (Health <= 0.f)
	{
		bDown = true;
		GetCharacterMovement()->StopMovementImmediately();

		if (AVantageGameMode* GameMode = GetWorld()->GetAuthGameMode<AVantageGameMode>())
		{
			GameMode->NotifyPlayerDown();
		}
	}
}

void AVantageCharacter::Revive(const FVector& At)
{
	bDown = false;
	Health = MaxHealth;
	TimeSinceDamage = 0.f;
	DamageFlash = 0.f;

	GetCharacterMovement()->StopMovementImmediately();
	SetActorLocation(At, false, nullptr, ETeleportType::TeleportPhysics);

	if (Revolver)
	{
		Revolver->BeginReload();
	}
}

void AVantageCharacter::CheckForFall()
{
	if (GetActorLocation().Z > FallRecoveryZ)
	{
		return;
	}

	FVector Recovery(0.f, 0.f, 140.f);
	if (const AVantageGameMode* GameMode = GetWorld()->GetAuthGameMode<AVantageGameMode>())
	{
		Recovery = GameMode->GetSpawnLocation();
	}

	UE_LOG(LogTemp, Warning,
		TEXT("Vantage: player fell out of the level and was returned to %s. ")
		TEXT("If this repeats immediately, the ground is not being built."),
		*Recovery.ToCompactString());

	GetCharacterMovement()->StopMovementImmediately();
	SetActorLocation(Recovery, false, nullptr, ETeleportType::TeleportPhysics);
}

void AVantageCharacter::ReportSilentInput()
{
	if (bReceivedAnyInput)
	{
		return;
	}

	UE_LOG(LogTemp, Warning,
		TEXT("Vantage: no input received in the first 8 seconds. If nothing responds, check that ")
		TEXT("Config/DefaultInput.ini sets DefaultPlayerInputClass and DefaultInputComponentClass ")
		TEXT("to the EnhancedInput versions, and that the EnhancedInput plugin is enabled."));
}
