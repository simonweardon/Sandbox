#include "ZombieCharacter.h"

#include "RobotDog.h"
#include "VantageCharacter.h"
#include "VantageGameMode.h"

#include "Components/CapsuleComponent.h"
#include "Components/SkeletalMeshComponent.h"
#include "Components/StaticMeshComponent.h"
#include "Engine/StaticMesh.h"
#include "Engine/World.h"
#include "GameFramework/CharacterMovementComponent.h"
#include "GameFramework/PlayerController.h"
#include "Materials/MaterialInstanceDynamic.h"
#include "UObject/ConstructorHelpers.h"

namespace
{
	constexpr float MeshHalfSize = 50.f;
	constexpr float CapsuleHalfHeight = 88.f;
}

const FName AZombieCharacter::HeadTag(TEXT("ZombieHead"));

AZombieCharacter::AZombieCharacter()
{
	PrimaryActorTick.bCanEverTick = true;

	UCapsuleComponent* Capsule = GetCapsuleComponent();
	Capsule->InitCapsuleSize(34.f, CapsuleHalfHeight);

	// The capsule must not eat the shot: the body meshes below are what decide
	// head versus body, so the capsule ignores the channel the gun traces on.
	Capsule->SetCollisionResponseToChannel(ECC_Visibility, ECR_Ignore);

	bUseControllerRotationYaw = false;

	UCharacterMovementComponent* Movement = GetCharacterMovement();
	Movement->bOrientRotationToMovement = true;
	Movement->RotationRate = FRotator(0.f, 260.f, 0.f);
	Movement->MaxWalkSpeed = 210.f;
	Movement->MaxAcceleration = 900.f;
	Movement->BrakingDecelerationWalking = 900.f;
	// They walk into things constantly; sliding off beats stopping dead.
	Movement->bUseSeparateBrakingFriction = false;

	// Without this they never move an inch. CharacterMovement only runs
	// ControlledCharacterMove when IsLocallyControlled() is true, which needs a
	// Controller - and these are spawned by the game mode and never possessed,
	// so every AddMovementInput was piling into a vector nothing consumed.
	Movement->bRunPhysicsWithNoController = true;

	BodyRoot = CreateDefaultSubobject<USceneComponent>(TEXT("BodyRoot"));
	BodyRoot->SetupAttachment(GetCapsuleComponent());

	// Built around the capsule centre: feet at -88, head near +70.
	LeftLeg  = AddPart(TEXT("LeftLeg"),  FVector(0.f, -13.f, -54.f), FVector(10.f, 9.f, 34.f), FRotator::ZeroRotator);
	RightLeg = AddPart(TEXT("RightLeg"), FVector(0.f, 13.f, -54.f),  FVector(10.f, 9.f, 34.f), FRotator::ZeroRotator);
	Torso    = AddPart(TEXT("Torso"),    FVector(0.f, 0.f, 8.f),     FVector(14.f, 21.f, 30.f), FRotator::ZeroRotator);
	Head     = AddPart(TEXT("Head"),     FVector(2.f, 0.f, 52.f),    FVector(12.f, 12.f, 13.f), FRotator::ZeroRotator, true);

	// Arms rotated to reach forward rather than hang - the whole silhouette.
	LeftArm  = AddPart(TEXT("LeftArm"),  FVector(14.f, -26.f, 22.f), FVector(8.f, 8.f, 27.f), FRotator(72.f, 0.f, 0.f));
	RightArm = AddPart(TEXT("RightArm"), FVector(14.f, 26.f, 22.f),  FVector(8.f, 8.f, 27.f), FRotator(72.f, 0.f, 0.f));

	// No mesh and no animation assets, so the inherited skeletal mesh is dead
	// weight. Hidden rather than removed, since ACharacter expects it present.
	GetMesh()->SetVisibility(false);
	GetMesh()->SetCollisionEnabled(ECollisionEnabled::NoCollision);
}

UStaticMeshComponent* AZombieCharacter::AddPart(const TCHAR* Name, const FVector& Location, const FVector& HalfExtent, const FRotator& Rotation, bool bIsHead)
{
	static ConstructorHelpers::FObjectFinder<UStaticMesh> CubeFinder(TEXT("/Engine/BasicShapes/Cube.Cube"));

	UStaticMeshComponent* Part = CreateDefaultSubobject<UStaticMeshComponent>(Name);
	Part->SetupAttachment(BodyRoot);
	Part->SetRelativeLocation(Location);
	Part->SetRelativeRotation(Rotation);
	Part->SetRelativeScale3D(HalfExtent / MeshHalfSize);

	if (CubeFinder.Succeeded())
	{
		Part->SetStaticMesh(CubeFinder.Object);
	}

	// Query only on the visibility channel: the gun can hit it, but it never
	// pushes the player or another zombie around.
	Part->SetCollisionEnabled(ECollisionEnabled::QueryOnly);
	Part->SetCollisionResponseToAllChannels(ECR_Ignore);
	Part->SetCollisionResponseToChannel(ECC_Visibility, ECR_Block);

	if (bIsHead)
	{
		Part->ComponentTags.Add(HeadTag);
	}

	return Part;
}

void AZombieCharacter::Randomise(int32 Seed)
{
	FRandomStream Stream(Seed);

	SwayAmount = Stream.FRandRange(4.f, 9.f);
	GaitRate = Stream.FRandRange(3.4f, 5.6f);
	Phase = Stream.FRandRange(0.f, 10.f);

	GetCharacterMovement()->MaxWalkSpeed = Stream.FRandRange(155.f, 275.f);

	// Greenish grey through to jaundiced, and clothes anywhere from black to
	// filthy brown.
	SkinColour = FLinearColor(
		Stream.FRandRange(0.22f, 0.42f),
		Stream.FRandRange(0.26f, 0.40f),
		Stream.FRandRange(0.16f, 0.28f));

	ClothColour = FLinearColor(
		Stream.FRandRange(0.09f, 0.26f),
		Stream.FRandRange(0.08f, 0.20f),
		Stream.FRandRange(0.08f, 0.20f));

	// A little height variation reads as a crowd rather than a formation.
	const float Height = Stream.FRandRange(0.88f, 1.12f);
	BodyRoot->SetRelativeScale3D(FVector(1.f, 1.f, Height));
}

void AZombieCharacter::BeginPlay()
{
	Super::BeginPlay();

	Health = MaxHealth;

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

	Tint(Head, SkinColour);
	Tint(LeftArm, SkinColour);
	Tint(RightArm, SkinColour);
	Tint(Torso, ClothColour);
	Tint(LeftLeg, ClothColour);
	Tint(RightLeg, ClothColour);
}

void AZombieCharacter::Tick(float DeltaSeconds)
{
	Super::Tick(DeltaSeconds);

	if (bDead)
	{
		Collapse(DeltaSeconds);
		return;
	}

	Phase += DeltaSeconds;
	AttackCooldown = FMath::Max(AttackCooldown - DeltaSeconds, 0.f);
	AttackLunge = FMath::Max(AttackLunge - DeltaSeconds * 3.2f, 0.f);

	ChasePlayer(DeltaSeconds);
	Shamble(DeltaSeconds);
}

void AZombieCharacter::ChasePlayer(float DeltaSeconds)
{
	const APlayerController* PC = GetWorld()->GetFirstPlayerController();
	AVantageCharacter* Player = PC ? Cast<AVantageCharacter>(PC->GetPawn()) : nullptr;
	if (!Player || Player->IsDown())
	{
		return;
	}

	FVector ToPlayer = Player->GetActorLocation() - GetActorLocation();
	const float DistanceSquared = ToPlayer.SizeSquared2D();
	ToPlayer.Z = 0.f;

	if (!ToPlayer.Normalize())
	{
		return;
	}

	AddMovementInput(ToPlayer, 1.f);

	if (DistanceSquared <= AttackRange * AttackRange && AttackCooldown <= 0.f)
	{
		AttackCooldown = AttackInterval;
		Player->TakeZombieHit(TouchDamage);

		// Lunge, so a hit is visible as well as felt.
		AttackLunge = 1.f;
		return;
	}

	// The dog gets swatted if it is the thing in reach. It is not a priority
	// target - they only ever walk at the player - but biting has a cost.
	if (ARobotDog* Dog = Player->GetDog())
	{
		if (!Dog->IsRebooting() && AttackCooldown <= 0.f &&
			FVector::DistSquared2D(GetActorLocation(), Dog->GetActorLocation()) <= FMath::Square(AttackRange))
		{
			AttackCooldown = AttackInterval;
			AttackLunge = 1.f;
			Dog->TakeZombieHit(TouchDamage * 1.4f);
		}
	}
}

void AZombieCharacter::Shamble(float DeltaSeconds)
{
	// One sine drives the whole gait: roll the body, bob it, and swing the arms
	// and legs in opposition off the same phase.
	const float Swing = FMath::Sin(Phase * GaitRate);
	const float Bob = FMath::Sin(Phase * GaitRate * 2.f);

	// The lunge throws the whole body forward and down, which is what makes a
	// swing read as a swing rather than the shambler simply arriving.
	BodyRoot->SetRelativeRotation(FRotator(Swing * 3.f + AttackLunge * 26.f, 0.f, Swing * SwayAmount));
	BodyRoot->SetRelativeLocation(FVector(AttackLunge * 24.f, 0.f, Bob * 2.6f));

	if (LeftLeg && RightLeg)
	{
		LeftLeg->SetRelativeRotation(FRotator(Swing * 22.f, 0.f, 0.f));
		RightLeg->SetRelativeRotation(FRotator(-Swing * 22.f, 0.f, 0.f));
	}

	if (LeftArm && RightArm)
	{
		LeftArm->SetRelativeRotation(FRotator(72.f + Swing * 7.f + AttackLunge * 22.f, 0.f, 0.f));
		RightArm->SetRelativeRotation(FRotator(72.f - Swing * 7.f + AttackLunge * 22.f, 0.f, 0.f));
	}

	if (Head)
	{
		Head->SetRelativeRotation(FRotator(Swing * 5.f, Swing * 8.f, 0.f));
	}
}

bool AZombieCharacter::ApplyHit(float Damage, bool bHeadshot)
{
	if (bDead)
	{
		return false;
	}

	Health -= bHeadshot ? MaxHealth : Damage;

	if (Health <= 0.f)
	{
		Die();
		return true;
	}

	return false;
}

void AZombieCharacter::Die()
{
	bDead = true;
	DeadFor = 0.f;

	GetCapsuleComponent()->SetCollisionEnabled(ECollisionEnabled::NoCollision);
	GetCharacterMovement()->StopMovementImmediately();
	GetCharacterMovement()->DisableMovement();

	for (UStaticMeshComponent* Part : { Torso.Get(), Head.Get(), LeftArm.Get(), RightArm.Get(), LeftLeg.Get(), RightLeg.Get() })
	{
		if (Part)
		{
			Part->SetCollisionEnabled(ECollisionEnabled::NoCollision);
		}
	}

	if (AVantageGameMode* GameMode = GetWorld()->GetAuthGameMode<AVantageGameMode>())
	{
		GameMode->NotifyZombieKilled();
	}
}

void AZombieCharacter::Collapse(float DeltaSeconds)
{
	DeadFor += DeltaSeconds;

	// Topple forward over half a second, sink, then clean up. A proper ragdoll
	// would need a physics asset, which needs a skeletal mesh, which is exactly
	// the asset dependency this project does without.
	const float Fall = FMath::Clamp(DeadFor / 0.55f, 0.f, 1.f);
	const float Eased = 1.f - FMath::Pow(1.f - Fall, 3.f);

	BodyRoot->SetRelativeRotation(FRotator(Eased * 84.f, 0.f, 0.f));
	BodyRoot->SetRelativeLocation(FVector(Eased * 34.f, 0.f, -Eased * 46.f));

	if (DeadFor > 6.f)
	{
		Destroy();
	}
	else if (DeadFor > 4.5f)
	{
		// Sink into the sand rather than blink out.
		AddActorWorldOffset(FVector(0.f, 0.f, -34.f * DeltaSeconds));
	}
}
